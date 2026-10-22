(async () => {
  const L = P31Live,
    $ = (s) => document.querySelector(s);
  const previewUrls = new Set();
  const clearPreviews = () => {previewUrls.forEach(url => URL.revokeObjectURL(url));previewUrls.clear();};
  let autoSync,recordsEpoch=0,mutations=0,reloading=0,workspaceDirty=false,dialogDirty=false;
  let me,
    records = [],
    state = {},
    customers = [],
    view = "Bookings",
    page = 0,
    activeId,
    pricing = null,
    siteContent = null,
    calendarDate = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });
  let directorySearch="",directoryKind="all",directoryPage=0,directoryRequest=0,customerDetailRequest=0;
  const names = {
      morning: "9:00 AM – 12:00 PM",
      afternoon: "12:00 PM – 3:00 PM",
    },
    labels = {
      standard: "Standard Cleaning",
      deep: "Deep Cleaning",
      apartment: "Apartment Cleaning",
      airbnb: "Airbnb Turnover",
    };
  const arrivalName = (id) => (names[id] || P31Windows.label(id)) + " ET";
  const money = (c) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(c / 100);
  const n = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const btn = (text, fn, cls = "outline") => {
    const b = n("button", text, cls);
    b.type = "button";
    b.onclick = async () => {
      if(b.disabled)return;
      try {
        const pending=fn();
        if(pending && typeof pending.then==='function') {b.disabled=true;await pending;}
      }catch(error){msg(error.message);}
      finally{if(b.isConnected)b.disabled=false;}
    };
    return b;
  };
  const input = (type = "text", value = "") => {
    const i = n("input");
    i.type = type;
    i.value = value;
    return i;
  };
  const label = (text, field) => {
    const l = n("label", text);
    l.append(field);
    return l;
  };
  function msg(text) {
    $("#workspace-message").textContent = text;
    if ($("#workspace-dialog").open) $("#dialog-message").textContent = text;
  }
  async function act(fn, success) {
    recordsEpoch++;mutations++;
    try {
      await fn();
      await reload();
      if (activeId && $("#workspace-dialog").open)
        detail(records.find((b) => b.id === activeId) || await L.api("booking",{query:{id:activeId}}));
      msg(success || "Saved.");
      return true;
    } catch (e) {
      msg(e.message);
      return false;
    } finally {mutations--;}
  }
  async function reload() {
    recordsEpoch++;reloading++;
    try {
    records = await L.api("bookings", { query: { page } });
    if (me.role === "owner") {
      state = await L.api("owner-state");
      if (view === "Pricing") pricing = await L.api("catalog");
      if (view === "Website content") siteContent = await L.api("site-content");
      customers = await L.api("customers", { query: { page } });
      [
        ...(state.settings?.windows || []),
        ...(state.days || []).flatMap((d) => d.windows),
      ].forEach((id) => (names[id] = P31Windows.label(id)));
    }else state.attention=await L.api("customer-attention");
    render();
    } finally {reloading--;recordsEpoch++;}
  }
  function startWorkspaceSync(){
    const line=$('#workspace-sync-status');line.hidden=false;
    autoSync=P31AutoSync.start({
      fetchUpdates:async()=>{
        if(mutations || reloading)return null;
        const epoch=recordsEpoch,currentPage=page,currentView=view;
        const [rows,ownerState,people,catalog,customerNotices]=await Promise.all([
          L.api('bookings',{query:{page:currentPage}}),
          me.role==='owner'?L.api('owner-state'):null,
          me.role==='owner'?L.api('customers',{query:{page:currentPage}}):null,
          me.role==='owner' && currentView==='Pricing'?L.api('catalog'):null,
          me.role==='customer'?L.api('customer-attention'):null
        ]);
        return {rows,ownerState,people,catalog,customerNotices,epoch,currentPage,currentView};
      },
      apply:packet=>{
        if(!packet || mutations || reloading || packet.epoch!==recordsEpoch || packet.currentPage!==page || packet.currentView!==view)return;
        const previous=records;
        const changes=P31Workflow.syncChanges({records,state,customers,pricing},packet);
        if(!changes.any && JSON.stringify(state.attention)===JSON.stringify(packet.customerNotices ?? state.attention))return;
        records=packet.rows;
        if(me.role==='owner'){
          state=packet.ownerState;customers=packet.people;if(packet.catalog)pricing=packet.catalog;
          updateAttention();
          [...(state.settings?.windows || []),...(state.days || []).flatMap(d=>d.windows)].forEach(id=>names[id]=P31Windows.label(id));
        }
        if(me.role==='customer'){state.attention=packet.customerNotices;updateAttention();}
        if(me.role!=="owner")document.querySelectorAll('[data-booking-checklist]').forEach(node=>{const b=records.find(row=>row.id===node.dataset.bookingChecklist);if(b){const step=node.contains(document.activeElement)?document.activeElement.closest('[data-checklist-step]')?.dataset.checklistStep:null;const next=P31Checklist.render(b,target=>detail(records.find(row=>row.id===b.id),target));node.replaceWith(next);if(step)next.querySelector('[data-checklist-step="'+step+'"] button')?.focus({preventScroll:true});}});
        document.querySelectorAll('[data-booking-progress]').forEach(node=>{const b=records.find(row=>row.id===node.dataset.bookingProgress);if(b)node.replaceWith(progress(b));});
        document.querySelectorAll('[data-booking-status]').forEach(node=>{const b=records.find(row=>row.id===node.dataset.bookingStatus);if(b)node.textContent=(node.closest('#workspace-detail')?'Status: ':'')+(P31Workflow.milestone(b)<0 && b.status!=='cancelled'?'Awaiting deposit':statusLabel(b.status));});
        const dialog=$('#workspace-dialog');
        if(dialog.open && activeId){
          const latest=records.find(b=>b.id===activeId),old=previous.find(b=>b.id===activeId);
          if(JSON.stringify(latest)!==JSON.stringify(old)){
            const editing=dialogDirty || dialog.contains(document.activeElement) && document.activeElement.matches('input,select,textarea');
            if(me.role==='owner' && latest && !editing){
              const scroll=dialog.scrollTop;detail(latest);dialog.scrollTop=scroll;
            }else{
              const notice=$('#booking-update-notice');notice.hidden=false;
              notice.replaceChildren(n('p',latest?(me.role==='owner'?'Customer updates received. Your edits below have been kept. Open the latest booking when you are ready.':'Your booking has been updated. Progress is current; open the latest details when you are ready. Your entries below have been kept.'):'This booking is no longer available in this view. Close the details to return to your bookings.'));
              if(latest)notice.append(btn('View latest details',()=>detail(records.find(b=>b.id===activeId))));
              if(me.role!=='owner'){
                if(!latest || latest.revision!==old?.revision || latest.quote_status!==old?.quote_status)dialog.querySelectorAll('[data-quote-revision]').forEach(b=>b.disabled=true);
                if(!latest || ['completed','cancelled'].includes(latest.status))dialog.querySelectorAll('form button[type=submit],form>button').forEach(b=>b.disabled=true);
              }
            }
          }
        }else if(!dialog.open && view!=='My Profile' && !workspaceDirty && !$('#workspace-content').contains(document.activeElement))render();
        if(me.role==='owner'){
          const notice=$('#workspace-updates');notice.hidden=false;
          const label=changes.newBookings?'New booking received.':changes.uploads?'Walkthrough or completion media updated.':changes.approvals?'Customer price approval updated.':'Dashboard updated automatically.';
          notice.replaceChildren(n('p',label+(workspaceDirty?' Your unsaved edits have been kept. Save them to load the latest view.':'')));
          if(!workspaceDirty && !dialog.open)notice.append(btn('View latest dashboard',()=>render()));
        }else $('#workspace-message').textContent='Booking updated automatically.';
      },
      onState:(state,error)=>{
        line.textContent=state==='connected'?'Updates automatically':'Updates paused · reconnecting…';
        if(error?.status===401 || error?.status===403){autoSync?.stop();$('#workspace-dialog').close();clearPreviews();records=[];$('#workspace-content').replaceChildren();$('#workspace-detail').replaceChildren();location.replace('sign-in.html');}
      }
    });
    document.addEventListener('visibilitychange',()=>document.visibilityState==='visible'?autoSync.wake():autoSync.pause());
    window.addEventListener('online',()=>autoSync.wake());window.addEventListener('focus',()=>autoSync.wake());
    window.addEventListener('pagehide',()=>autoSync.stop());window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
    $('#workspace-dialog').addEventListener('close',()=>{if(!workspaceDirty && view!=='My Profile')render();});
  }
  const ownerAttentionLabels={booking:'New bookings',walkthrough:'Walkthroughs to review',approval:'Customer price approvals',change:'Change requests'};
  const getAttentionLabels=()=>me.role==='owner'?ownerAttentionLabels:{access:'Access authorization',review:'Walkthrough reviewed',approval:'Price needs approval',payment:'Final payment due',change:'Request updates'};
  function updateAttention(){
    if(!me)return;
    const attentionLabels=getAttentionLabels();
    const attention=state.attention || {counts:{},items:[]},root=$('#admin-attention');root.hidden=false;
    root.setAttribute('aria-label',me.role==='owner'?'Needs your attention':'Your care updates');
    root.replaceChildren(n('p',me.role==='owner'?'Needs your attention':'Your care updates','eyebrow'));
    const tools=n('div',undefined,'attention-counts');
    for(const [kind,title] of Object.entries(attentionLabels)){
      const count=Number(attention.counts[kind] || 0),b=btn('',()=>showAttention(kind),'attention-pill');
      b.append(n('span',title),n('strong',String(count)));b.setAttribute('aria-label',title+': '+count);tools.append(b);
    }
    root.append(tools);
    for(const node of document.querySelectorAll('#workspace-nav button,#mobile-workspace-nav button')){
      const name=node.dataset.view || node.dataset.mobileView,kinds=(me.role==='owner'?{Bookings:['booking'],Walkthroughs:['walkthrough'],Payments:['approval'],'Proverbs 31 Cal':['change']}:{Bookings:['approval','change','access'],Walkthroughs:['review'],Payments:['payment']})[name] || [],count=kinds.reduce((sum,kind)=>sum+Number(attention.counts[kind] || 0),0),description=kinds.map(kind=>attentionLabels[kind]).join(' / ');
      node.querySelector('.notification-badge')?.remove();
      if(count){const badge=n('span',count>99?'99+':String(count),'notification-badge');badge.setAttribute('aria-hidden','true');node.append(badge);}
      node.setAttribute('aria-label',name+(count?' · '+count+' '+description.toLowerCase():''));
    }
  }
  function showAttention(kind){
    const attentionLabels=getAttentionLabels();
    const win=n('dialog',undefined,'attention-sheet');win.setAttribute('aria-label',attentionLabels[kind]);
    const head=n('div',undefined,'dialog-header');head.append(n('h2',attentionLabels[kind]),btn('×',()=>win.close(),'close'));win.append(head);
    win.append(n('p',kind==='access'?'Read and sign your home-access permission form before Gabrielle heads to your visit.':me.role==='owner'?(kind==='change'?'Requests stay here until an admin approves or declines them.':kind==='walkthrough'?'Walkthroughs stay here until their review is saved.':'Opening a booking clears its current new-item badge. Future updates can create a new badge.'):(kind==='change'?'Open the booking to read the admin’s decision.':kind==='review'?'Opening the booking clears this review notice.':kind==='approval'?'Your price stays flagged until you approve the current reviewed total.':'Your final balance stays flagged until payment is recorded. Contact the company to arrange payment.'),'fine'));
    const items=(state.attention?.items || []).filter(item=>item.kind===kind);
    if(!items.length)win.append(n('p','You’re all caught up.'));
    items.forEach(item=>{const row=n('div',undefined,'list-row');row.append(n('p',(item.customer_name?item.customer_name+' · ':'')+(labels[item.service] || '')+' · '+item.visit_date+(item.amount_cents!==null && item.amount_cents!==undefined?' · '+money(item.amount_cents):'')),btn('Open booking',async()=>{const b=await L.api('booking',{query:{id:item.booking_id}});const index=records.findIndex(row=>row.id===b.id);if(index<0)records.push(b);else records[index]=b;win.close();detail(b,kind==="access");}));win.append(row);});
    if((state.attention?.counts[kind] || 0)>items.length)win.append(n('p','Showing the latest 100 notices. More appear as you review these.','fine'));
    win.addEventListener('close',()=>win.remove(),{once:true});document.body.append(win);win.showModal();
  }
  async function readBookingAttention(id){
    const ids=(state.attention?.items || []).filter(item=>item.booking_id===id && (me.role==='owner'?!['walkthrough','change'].includes(item.kind):['review','change'].includes(item.kind))).map(item=>item.id);
    if(!ids.length)return;
    recordsEpoch++;
    try{state.attention=await L.api(me.role==='owner'?'attention-read':'customer-attention-read',{method:'POST',data:{ids}});updateAttention();}
    catch{msg('Unable to clear the attention badge. It will remain until the next successful review.');}
    finally{recordsEpoch++;}
  }
  function choice(values, current) {
    const s = n("select");
    values.forEach(([value, text]) => {
      const o = n("option", text);
      o.value = value;
      s.append(o);
    });
    s.value = current;
    return s;
  }
  function form(parent, fields, text, submit) {
    const f = n("form");
    for (const [title, field] of fields) f.append(label(title, field));
    const b = n("button", text, "primary");
    f.append(b);
    f.onsubmit = async (e) => {
      e.preventDefault();
      b.disabled = true;
      try {
        await submit();
      } catch (e) {
        msg(e.message);
      } finally {
        b.disabled = false;
      }
    };
    parent.append(f);
    return f;
  }
  function section(title) {
    const s = n("section", undefined, "card");
    s.append(n("h2", title));
    return s;
  }
  const visitStages=[['requested','Booked'],['confirmed','Confirmed'],['on_the_way','On the way'],['in_progress','Cleaning in progress'],['completed','Completed']];
  const statusLabel=value=>visitStages.find(([id])=>id===value)?.[1] || (value==='awaiting_walkthrough'?'Booked · awaiting walkthrough':value==='cancelled'?'Cancelled':value.replaceAll('_',' '));
  function progress(b){
    const box=n('section',undefined,'visit-progress');box.setAttribute('aria-label','Cleaning progress');box.dataset.bookingProgress=b.id;
    box.append(n('p',b.status==='cancelled'?'Booking cancelled':'Your visit · '+(P31Workflow.milestone(b)<0?'Awaiting deposit':statusLabel(b.status)),'progress-title'));
    if(b.status==='cancelled')return box;
    const current=P31Workflow.milestone(b);
    const list=n('ol');visitStages.forEach(([id,text],i)=>{const item=n('li',undefined,i<current?'done':i===current?'current':'');if(i===current)item.setAttribute('aria-current','step');const dot=n('span',i<current?'✓':String(i+1),'stage-dot');dot.setAttribute('aria-hidden','true');item.append(dot,n('span',text));list.append(item);});box.append(list);return box;
  }
  function summary(b, parent) {
    const q = b.quote_snapshot;
    parent.append(
      n(
        "p",
        labels[b.service] +
          (b.apartment_mode ? " · " + b.apartment_mode : "") +
          " · " +
          q.space,
      ),
      n("p", b.visit_date + " · " + arrivalName(b.arrival)),
      n("p", "Status: " + (P31Workflow.milestone(b)<0 && b.status!=="cancelled"?"Awaiting deposit":statusLabel(b.status)), "badge"),
    );
    const dl = n("dl", undefined, "care-summary-prices");
    const row = (key, value) => {
      const d = n("div");
      d.append(n("dt", key), n("dd", value));
      dl.append(d);
    };
    row("Starting service price*", money(q.base_cents));
    q.addons.forEach((a) =>
      row(
        a.label + (a.id === "laundry" ? " × " + a.quantity : ""),
        a.included ? "Included" : money(a.amount_cents),
      ),
    );
    row("Starting estimate*", money(q.total_cents));
    row("Starting-price deposit", money(q.deposit_cents));
    if (b.final_cents !== null) row("Reviewed total", money(b.final_cents));
    const figures = P31Workflow.totals(b);
    row("Pricing adjustments", money(figures.adjustments));
    row("Deposit recorded", money(b.deposit_paid_cents));
    row("Other payments recorded", money(b.final_paid_cents));
    row(
      b.invoice_issued ? "Issued remaining balance" : "Estimated remainder",
      money(
        Math.max(
          0,
          figures.balance,
        ),
      ),
    );
    parent.querySelector(".badge").dataset.bookingStatus=b.id;
    parent.append(
      dl,
      n(
        "p",
        b.invoice_issued
          ? "A final balance has been issued. Online payment processing is not connected; contact the company to arrange payment."
          : "*Starting amounts only. Final pricing follows walkthrough review and customer approval.",
        "fine",
      ),
    );
    const included = n("ul");
    const text =
      b.service === "apartment"
        ? [
            "Standard cleaning of the empty apartment",
            "Floor and surface cleaning",
            "Routine kitchen and bathroom care",
          ]
        : b.service === "airbnb"
          ? [
              "Standard cleaning of the selected guest bedroom and bathroom",
              "Floors, surfaces, bed making, and bathroom care",
            ]
          : [
              "Floors, surfaces, bed making, and routine kitchen/bathroom cleaning",
              ...(b.service === "deep"
                ? ["Baseboards and windows", "Sanitizing and disinfecting"]
                : []),
            ];
    text.forEach((t) => included.append(n("li", t)));
    parent.append(n("h3", "Included care"), included);
  }
  function render() {
    const root = $("#workspace-content");
    workspaceDirty=false;
    updateAttention();
    $("#workspace-updates").hidden=true;
    root.replaceChildren();
    $("#workspace-title").textContent = view;
    document.querySelectorAll("#workspace-nav button").forEach((b) => {
      b.setAttribute("aria-current", b.dataset.view === view ? "page" : "false");
    });
    if (view === "Bookings" || view === "Walkthroughs" || view === "Payments") {
      if (me.role === "owner")
        root.append(btn("Add manual booking", manual, "primary"));
      let list = records;
      if (view === "Walkthroughs")
        list = list.filter(
          (b) => !b.invoice_issued && b.status !== "cancelled",
        );
      if (view === "Payments")
        list = list.filter((b) => b.status !== "cancelled");
      list.forEach((b) => {
        const c = section(
          b.property?.name || b.customers?.name || b.quote_snapshot.service,
        );
        c.append(n("p", "Booking · " + b.id.slice(0,8).toUpperCase(), "fine"));
        c.classList.add("booking-card");
        const facts=n("div",undefined,"booking-facts");
        facts.append(n("span",labels[b.service]),n("span",b.quote_snapshot.space),n("strong",new Date(b.visit_date+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})),n("span",arrivalName(b.arrival)));
        const balance=P31Workflow.totals(b);
        const foot=n("div",undefined,"booking-card-footer");
        foot.append(n("span",(P31Workflow.milestone(b)<0 && b.status!=="cancelled"?"Awaiting deposit":statusLabel(b.status)),"badge"),n("strong",money(balance.total)+(b.final_cents===null?"*":"")));
        foot.querySelector(".badge").dataset.bookingStatus=b.id;
        c.append(facts,progress(b),foot,n("p",b.final_cents===null?"Starting estimate · subject to walkthrough review":"Reviewed total · "+({awaiting_customer:"Awaiting your approval",accepted:"Approved",draft:"In review"}[b.quote_status] || b.quote_status.replaceAll("_"," ")),"fine"));
        if(b.status==="confirmed")c.append(n("p",b.access_signed_at?"Home-access authorization signed":me.role==="owner"?"Waiting for customer · Home-access authorization":"Action needed · Sign home-access authorization","badge"));
        if(b.status==="confirmed" && !b.access_signed_at && me.role!=="owner")c.append(btn("Review access authorization",()=>detail(records.find(row=>row.id===b.id),true),"primary"));
        if(me.role!=="owner")c.append(P31Checklist.render(b,target=>detail(records.find(row=>row.id===b.id),target)));
        c.append(btn("Open booking", () => {const latest=records.find(row=>row.id===b.id);if(latest)detail(latest);else{render();msg("This booking is no longer available in this view.");}}));
        root.append(c);
      });
      if (!list.length) root.append(n("p", "No bookings to show."));
      const pages = n("div", undefined, "detail-actions");
      if (page > 0)
        pages.append(
          btn("Previous page", () => {
            page--;
            reload().catch((e) => msg(e.message));
          }),
        );
      if (records.length === 100)
        pages.append(
          btn("Next page", () => {
            page++;
            reload().catch((e) => msg(e.message));
          }),
        );
      root.append(pages);
    } else if (view === "Customers") {
      renderCustomerDirectory(root);
    } else if (view === "Proverbs 31 Cal") {
      const c = section("Proverbs 31 Cal");
      c.append(
        n(
          "p",
          "Manage visits and open cleaning blocks here. Calendar exports save a copy to your personal calendar.",
        ),
      );
      const date = input("date", calendarDate),
        exports = n("div"),
        grid = n("div", undefined, "calendar-grid"),
        heading = n("div", undefined, "calendar-heading"),
        monthTitle = n("h3");
      let monthBookings = [];
      const moveMonth = (delta) => {
        const d = new Date(date.value + "T12:00:00");
        d.setDate(1);
        d.setMonth(d.getMonth() + delta);
        calendarDate =
          d.getFullYear() +
          "-" +
          String(d.getMonth() + 1).padStart(2, "0") +
          "-01";
        render();
      };
      heading.append(
        btn("‹ Previous month", () => moveMonth(-1)),
        monthTitle,
        btn("Next month ›", () => moveMonth(1)),
      );
      c.append(exports, heading, grid);
      const loadMonth = async () => {
        const key = date.value.slice(0, 7),
          d = new Date(key + "-01T12:00:00");
        monthTitle.textContent = d.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        });
        grid.replaceChildren();
        monthBookings = await L.api("calendar", { query: { month: key } });
        exports.replaceChildren(
          P31Cal.controls(
            monthBookings,
            state.settings?.timezone || "America/New_York",
          ),
        );
        for (const day of ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"])
          grid.append(n("strong", day));
        for (let i = 0; i < d.getDay(); i++) grid.append(n("span"));
        const total = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        for (let i = 1; i <= total; i++) {
          const day = key + "-" + String(i).padStart(2, "0"),
            count = monthBookings.filter((b) => b.visit_date === day).length;
          const off =
            (!(state.days || []).some((d) => d.visit_date === day) &&
              !(state.settings?.working_days || []).includes(
                new Date(day + "T12:00:00").getDay(),
              )) ||
            (state.days || []).some(
              (d) => d.visit_date === day && !d.windows.length,
            ) ||
            (state.blocks || []).some(
              (b) => b.visit_date === day && !b.arrival && !b.start_time,
            );
          const partial =
            !off && (state.blocks || []).some((b) => b.visit_date === day);
          const b = btn(
            String(i),
            () => {
              calendarDate = day;
              render();
            },
            (off ? "blocked " : partial ? "partial-block " : "") +
              (count ? "has-visits" : ""),
          );
          b.setAttribute(
            "aria-label",
            day +
              " · " +
              count +
              " visits" +
              (off ? " · blocked" : partial ? " · time blocked" : ""),
          );
          b.setAttribute("aria-pressed", day === date.value);
          if(count)b.append(n("span",count+" visit"+(count>1?"s":"")));
          if (partial) b.append(n("span", "Blocked"));
          grid.append(b);
        }
        showVisits();
      };
      const slots = n("div");
      const load = async () => {
        try {
          const rows = await L.api("availability", {
            query: { start: date.value, days: 1 },
          });
          slots.replaceChildren(
            n("p", date.value),
            ...(rows[0]?.slots || []).map((slot) =>
              n(
                "p",
                arrivalName(slot.id) +
                  " · " +
                  (slot.available ? "Available" : "Unavailable / full"),
              ),
            ),
            P31Windows.picker(
              (state.days || []).find((d) => d.visit_date === date.value)
                ?.windows ?? state.settings.windows,
              (ids) =>
                act(
                  () =>
                    L.api("schedule", {
                      method: "POST",
                      data: {
                        action: "day_windows",
                        data: { date: date.value, windows: ids },
                      },
                    }),
                  "Open blocks saved.",
                ),
            ),
          );
        } catch (e) {
          msg(e.message);
        }
      };
      date.onchange = () => {
        calendarDate = date.value;
        load();
        loadMonth().catch((e) => msg(e.message));
      };
      const visits = n("div");
      const showVisits = () => {
        visits.replaceChildren(n("h3", "Visits on this date"));
        const found = monthBookings.filter(
          (b) => b.visit_date === date.value && b.status !== "cancelled",
        );
        found.forEach((b) =>
          visits.append(
            btn(
              (b.customers?.name || "Cleaning") +
                " · " +
                arrivalName(b.arrival) +
                " · " +
                b.status,
              () => detail(b),
            ),
          ),
        );
        if (!found.length) visits.append(n("p", "No visits on this date."));
      };
      date.addEventListener("change", showVisits);
      showVisits();
      c.append(label("Date", date), slots, visits);
      load();
      loadMonth().catch((e) => msg(e.message));
      const window = choice(
          [
            ["", "Entire day"],
            ["custom", "Custom hours"],
            ...Object.entries(names),
          ],
          "",
        ),
        reason = input();
      reason.required = true;
      const through = input("date", date.value),
        startTime = input("time", "09:00"),
        endTime = input("time", "12:00");
      through.required = true;
      const hours = n("div");
      hours.hidden = true;
      hours.append(label("From", startTime), label("Until", endTime));
      window.onchange = () => (hours.hidden = window.value !== "custom");
      date.addEventListener("change", () => {
        through.min = date.value;
        through.value = date.value;
      });
      c.append(
        btn("Select seven days", () => {
          const d = new Date(date.value + "T12:00:00");
          d.setDate(d.getDate() + 6);
          through.value =
            d.getFullYear() +
            "-" +
            String(d.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(d.getDate()).padStart(2, "0");
        }),
        hours,
      );
      form(
        c,
        [
          ["Through date", through],
          ["Block", window],
          ["Reason", reason],
        ],
        "Block time",
        () =>
          act(
            () =>
              L.api("schedule", {
                method: "POST",
                data: {
                  action: "block",
                  data: {
                    date: date.value,
                    arrival:
                      window.value === "custom" ? null : window.value || null,
                    through: through.value,
                    start_time:
                      window.value === "custom" ? startTime.value : null,
                    end_time: window.value === "custom" ? endTime.value : null,
                    reason: reason.value,
                  },
                },
              }),
            "Time blocked.",
          ),
      );
      (state.blocks || []).forEach((b) => {
        const p = n(
          "p",
          b.visit_date +
            " · " +
            (b.start_time
              ? b.start_time.slice(0, 5) + "–" + b.end_time.slice(0, 5)
              : b.arrival
                ? arrivalName(b.arrival)
                : "Entire day") +
            " · " +
            b.reason,
        );
        p.append(
          btn(
            "Remove",
            () =>
              act(
                () =>
                  L.api("schedule", {
                    method: "POST",
                    data: { action: "unblock", data: { id: b.id } },
                  }),
                "Block removed.",
              ),
            "text-btn",
          ),
        );
        c.append(p);
      });
      root.append(c);
    } else if (view === "Pricing") {
      root.append(n("p", "Update starting prices for new quotes and bookings. Existing bookings keep their saved price; adjust those individually after walkthrough review.", "fine"));
      if (!pricing) {
        root.append(btn("Load pricing", () => act(async () => { pricing = await L.api("catalog"); })));
        return;
      }
      const groups = [
        ["Home and guest-suite starting prices", "space", pricing.spaces, "base_cents"],
        ["Deep Cleaning adjustment", "deep", pricing.services.filter(item => item.id === "deep"), "upgrade_cents"],
        ["Optional additions", "addon", pricing.addons, "cents"],
      ];
      groups.forEach(([title, kind, rows, key]) => {
        const box = section(title);
        if (kind === "deep") box.append(n("p", "Added to the selected home's Standard Cleaning price. Customers see the combined starting price.", "fine"));
        rows.forEach(item => {
          const amount = input("number", (item[key] / 100).toFixed(2));
          amount.min = kind === "deep" ? "0" : "0.01";
          amount.max = "10000"; amount.step = "0.01"; amount.required = true;
          const title = item.label + (item.per_load ? " · per load" : "") + " (USD)";
          form(box, [[title, amount]], "Save starting price", async () => {
            const cents = Math.round(Number(amount.value) * 100);
            await act(async () => {
              await L.api("pricing", {method:"POST", data:{kind,id:String(item.id),cents,expected_cents:item[key]}});
            }, "Starting price saved. Existing bookings were not changed.");
          });
        });
        root.append(box);
      });
    } else if (view === "Website content") {
      root.append(n('p','Update the About Us and Contact pages. Saved changes are public. Leave the phone number blank to hide it until you are ready.','fine'));
      if(!siteContent){root.append(btn('Load website content',()=>act(async()=>{siteContent=await L.api('site-content')})));return;}
      const box=section('About Us & Contact'),fields={},specs=[['Company introduction','company_intro',3000],['Owner name','founder_name',120],['Owner introduction / biography','founder_bio',5000],['Contact introduction','contact_intro',2000],['Business contact email','contact_email',254],['Phone number (optional)','contact_phone',40],['Service area','service_area',500],['Address / distance review note','service_area_note',1000]];
      specs.forEach(([label,key,max])=>{const field=key.includes('intro')||key==='founder_bio'||key==='service_area_note'?n('textarea'):input(key==='contact_email'?'email':key==='contact_phone'?'tel':'text');field.value=siteContent[key] || '';field.maxLength=max;field.required=!['founder_bio','contact_phone'].includes(key);fields[key]=field;});
      const socialFields={};
      P31Social.platforms.forEach(platform=>{const cfg=siteContent.social_links?.[platform.id] || {enabled:false,url:''};const visible=input('checkbox'),url=input('url',cfg.url);visible.checked=cfg.enabled===true;url.maxLength=2048;url.placeholder='https://'+platform.id+'.com/your-page';url.required=visible.checked;visible.onchange=()=>{url.required=visible.checked;url.setCustomValidity('')};url.oninput=()=>url.setCustomValidity('');socialFields[platform.id]={visible,url};});
      let photoPath=siteContent.photo_path;
      const photo=n('img'),photoStatus=n('p'),file=input('file');file.accept='image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';photo.alt='Public owner photo';photo.style.maxWidth='240px';photo.hidden=!siteContent.photo_url;if(siteContent.photo_url)photo.src=siteContent.photo_url;photoStatus.setAttribute('role','status');
      const upload=btn('Upload owner photo',async()=>{if(!file.files[0])throw Error('Choose an owner photo first.');const chosen=await P31Workflow.prepareFile(file.files[0],[],text=>photoStatus.textContent=text);if(!chosen.type.startsWith('image/')||chosen.size>2097152)throw Error('Choose a JPG, PNG, or WebP photo up to 2 MB. HEIC photos convert automatically.');photoStatus.textContent='Uploading public photo…';const bytes=new Uint8Array(await chosen.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));const saved=await L.api('site-photo',{method:'POST',data:{mime:chosen.type,base64:btoa(binary)}});photoPath=saved.path;photo.src=saved.url;photo.hidden=false;workspaceDirty=true;photoStatus.textContent='Photo uploaded. Save website content to display it on About Us.';});
      const remove=btn('Remove photo from About Us',()=>{photoPath=null;photo.hidden=true;workspaceDirty=true;photoStatus.textContent='Save website content to remove the displayed photo.'},'text-btn');
      const photoLabel=n('label','Owner photo');photoLabel.append(file);box.append(n('p','Only upload a photo intended for the public website. Up to 2 MB. Contact email changes do not change sign-in or admin permissions.','fine'),photo,photoLabel,upload,remove,photoStatus);
      const pageForm=form(box,specs.map(([label,key])=>[label,fields[key]]),'Save website content',()=>act(async()=>{const socials={};for(const p of P31Social.platforms){const {visible,url}=socialFields[p.id],value=url.value.trim();if((visible.checked || value) && !P31Social.valid(p.id,value)){url.setCustomValidity('Enter a valid HTTPS '+p.label+' page URL, or clear it and turn visibility off.');url.reportValidity();throw Error('Check the '+p.label+' link.')}socials[p.id]={enabled:visible.checked,url:value}}const content=Object.fromEntries(Object.entries(fields).map(([key,field])=>[key,field.value.trim()]));content.photo_path=photoPath;content.social_links=socials;await L.api('site-content',{method:'POST',data:{content,revision:siteContent.revision}});},'Website content published.'));
      const socials=n('section');socials.append(n('h3','Footer social media'),n('p','Turn a platform on and add its HTTPS page URL to show its icon. Turn it off to hide it. No profile links are supplied automatically.','fine'));
      P31Social.platforms.forEach(p=>{const group=n('fieldset');group.append(n('legend',p.label));const {visible,url}=socialFields[p.id];group.append(label('Show '+p.label+' icon',visible),label(p.label+' page URL',url));socials.append(group);});
      pageForm.insertBefore(socials,pageForm.lastElementChild);
      root.append(box);
    } else if (view === "Forms & agreements") {
      root.append(P31Access.editor({api:L.api,save:fn=>act(fn,"Access form published.")}));
    } else if (view === "Availability") {
      const c = section("Working days and arrival windows"),
        days = n("fieldset"),
        windows = n("fieldset");
      days.append(n("legend", "Working days"));
      ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((name, i) => {
        const check = input("checkbox");
        check.checked = state.settings.working_days.includes(i);
        check.value = i;
        days.append(label(name, check));
      });
      windows.append(n("legend", "Arrival windows"));
      Object.entries(names).forEach(([id, name]) => {
        const check = input("checkbox");
        check.checked = state.settings.windows.includes(id);
        check.value = id;
        windows.append(label(name, check));
      });
      const capacity = input("number", state.settings.capacity);
      capacity.min = 1;
      capacity.max = 10;
      capacity.required = true;
      c.append(days, windows);
      form(
        c,
        [["Bookings per arrival block", capacity]],
        "Save availability",
        () =>
          act(
            () =>
              L.api("schedule", {
                method: "POST",
                data: {
                  action: "settings",
                  data: {
                    days: [...days.querySelectorAll(":checked")].map((i) =>
                      Number(i.value),
                    ),
                    windows: [...windows.querySelectorAll(":checked")].map(
                      (i) => i.value,
                    ),
                    capacity: Number(capacity.value),
                  },
                },
              }),
            "Availability saved.",
          ),
      );
      root.append(c);
    } else if (view === "Activity") {
      const c = section("Audit history");
      (state.activity || []).forEach((e) =>
        c.append(
          n(
            "p",
            new Date(e.created_at).toLocaleString("en-US", {timeZone: "America/New_York", timeZoneName: "short"}) +
              " · " +
              e.action +
              " · " +
              (e.booking_id || "Business settings"),
            "fine",
          ),
        ),
      );
      const queue = section("Notification queue");
      queue.append(
        n(
          "p",
          L.config.notificationsEnabled ? "Customer emails are delivered automatically. Sent means the email provider accepted the message; inbox delivery is tracked in Resend." : "Email delivery is paused. Booking notifications are saved here and will not be sent while delivery is disabled.",
        ),
      );
      (state.outbox || []).forEach((e) =>
        queue.append(
          n("p", e.kind + " · " + e.recipient + " · " + (e.status === "sent" ? "Accepted by email provider" : e.status === "failed" ? "Needs review" : "Queued") + (e.last_error ? " · " + e.last_error : ""), "fine"),
          btn("Preview email template",async()=>{
            try {
              const template=await L.api('notification-preview',{query:{id:e.id}});
              const dialog=n('dialog');dialog.className='email-preview';
              const frame=n('iframe');frame.setAttribute('sandbox','');frame.title='Email template preview';frame.srcdoc=template.html;
              dialog.append(n('h2',template.subject),n('p',template.notice,'fine'),frame,btn('Close',()=>dialog.close()));
              dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
            }catch(error){msg(error.message);}
          }),
        ),
      );
      root.append(c, queue);
    } else if (view === "My Profile") {
      const p = me.profile || {},
        c = section("Your saved details"),
        name = input("text", p.name || ""),
        phone = input("tel", p.phone || ""),
        address = input("text", p.address || ""),
        access = n("textarea"),
        pets = n("textarea");
      name.required = true;
      access.value = p.access_notes || "";
      pets.value = p.pet_notes || "";
      c.append(n("p", me.user.email));
      form(
        c,
        [
          ["Name", name],
          ["Phone", phone],
          ["Address", address],
          ["Access instructions", access],
          ["Pet notes", pets],
        ],
        "Save profile",
        () =>
          act(async () => {
            me.profile = await L.api("profile", {
              method: "POST",
              data: {
                name: name.value,
                phone: phone.value,
                address: address.value,
                access_notes: access.value,
                pet_notes: pets.value,
              },
            });
          }, "Profile saved to your account."),
      );
      root.append(c);
    }
  }
  function action(b, name, data, request_id) {
    return L.api("action", {
      method: "POST",
      data: { id: b.id, action: name, data, request_id },
    });
  }
  function detail(b, focusAccess=false) {
    $("#workspace-dialog").setAttribute("aria-label","Booking details");$("#workspace-dialog .dialog-header h2").textContent="Booking details";
    const checklistTarget=typeof focusAccess==="string"?focusAccess:null;
    if (!b) return;
    clearPreviews();
    $("#booking-update-notice").hidden=true;dialogDirty=false;
    activeId = b.id;
    readBookingAttention(b.id);
    const root = $("#workspace-detail");
    root.replaceChildren();
    const info = section(b.customers?.name || "Your cleaning");
    info.dataset.checklistTarget="progress";
    info.append(progress(b));
    summary(b, info);
    const property = b.property || b.customers || {};
    info.append(
      n("h3", "Visit details"),
      n("p", property.address || ""),
      n("p", (property.email || "") + " · " + (property.phone || "")),
    );
    if (property.access_notes)
      info.append(n("p", "Access: " + property.access_notes));
    if (property.pet_notes) info.append(n("p", "Pets: " + property.pet_notes));
    if (b.care_notes) info.append(n("p", "Care notes: " + b.care_notes));
    info.append(
      n("p", "Quote status: " + b.quote_status.replaceAll("_", " "), "badge"),
    );
    if (b.review_notes)
      info.append(n("p", "Walkthrough review: " + b.review_notes));
    (b.quote_adjustments || []).forEach((a) =>
      info.append(n("p", a.label + " · " + money(a.cents))),
    );
    info.append(
      P31Cal.controls(
        [b],
        state.settings?.timezone || "America/New_York",
        true,
      ),
    );
    root.append(info);
    root.append(P31Access.booking(b,{focus:focusAccess===true || checklistTarget==="access",arrivalLabel:arrivalName(b.arrival),owner:me.role==="owner",api:L.api,save:fn=>act(fn,"Home-access authorization signed.")}));
    const figures = P31Workflow.totals(b);
    const quote = section("Your pricing review");
    quote.dataset.checklistTarget="quote";
    quote.classList.add("quote-comparison");
    const comparison = n("dl");
    [["Original starting estimate",figures.starting],["Adjustments",figures.adjustments],[b.final_cents === null ? "Current estimate*" : "Reviewed total",figures.total],["Recorded payments",figures.paid],["Remaining balance",figures.balance]].forEach(([title,value])=>{
      const row=n("div");row.append(n("dt",title),n("dd",money(value)));comparison.append(row);
    });
    quote.append(comparison,n("p", "Quote revision " + b.revision + " · " + b.quote_status.replaceAll('_',' '),"fine"));
    (b.quote_adjustments || []).forEach(item=>quote.append(n("p",item.label + " · " + money(item.cents))));
    if (b.final_cents === null) quote.append(n("p","This estimate is awaiting walkthrough review. It is not a confirmed final price.","fine"));
    if (b.quote_status === 'accepted') quote.append(n("p","Customer approval is recorded for this quote. Any later adjustment requires a new review and approval.","fine"));
    if (me.role !== "owner" && b.quote_status === "awaiting_approval") {
      const accept = btn("Accept reviewed total · " + money(figures.total), () => act(()=>action(b,"accept_quote",{revision:b.revision}),"Reviewed quote accepted."),"primary");
      const consent = input("checkbox");accept.disabled=true;
      accept.dataset.quoteRevision=b.revision;consent.onchange=()=>accept.disabled=!consent.checked || records.find(row=>row.id===b.id)?.revision!==b.revision;
      quote.append(label("I have reviewed the service details, adjustments, and total shown above.",consent),accept);
    }
    root.append(quote);
    if ((b.payment_records || []).length) {
      const history=section("Payments recorded");
      b.payment_records.forEach(payment=>history.append(n("p",money(payment.cents)+" · "+payment.kind+" · "+payment.method+" · "+new Date(payment.created_at).toLocaleDateString("en-US", {timeZone: "America/New_York"}))));
      history.append(n("p","These are payments recorded by the company. No card transaction is processed on this website yet.","fine"));root.append(history);
    }
    if(me.role!=='owner'){
      (b.booking_requests || []).forEach(request=>info.append(n('p',(request.kind==='cancel'?'Cancellation':'Rescheduling')+' request · '+(request.resolved?(request.decision || 'Reviewed'):'Awaiting admin review')+' · '+request.notes+(request.review_notes?' · Admin: '+request.review_notes:''),'request-status')));
      if(b.status==='cancelled')info.append(n('p','This booking is cancelled. Recorded payments are unchanged. No automatic fees or refunds have been applied.','fine'));
    }
    if (me.role !== "owner" && !["completed", "cancelled"].includes(b.status)) {
      const notes = n("textarea");
      notes.required = true;notes.maxLength=1000;
      const kind = choice(
        [
          ["reschedule", "Reschedule request"],
          ["cancel", "Cancellation request"],
        ],
        "reschedule",
      );
      info.append(n("p", "A cancellation or rescheduling request does not change your booking until the company reviews it. No automatic fees or refunds are applied.", "fine"));

      form(
        info,
        [
          ["Change request", kind],
          ["Preferred date / details", notes],
        ],
        "Send request",
        () =>
          act(
            () =>
              action(b, "request_change", {
                kind: kind.value,
                notes: notes.value,
              }),
            "Your request has been saved for owner review.",
          ),
      );
    }
    const media = section("Virtual walkthrough");
    media.dataset.checklistTarget="walkthrough";
    media.append(
      n(
        "p",
        "Upload room photos or videos for pricing review. Up to 6 files, 20 MB each. Files are private and accessible only to you and the owner.",
        "fine",
      ),
    );
    (b.walkthrough_files || [])
      .filter((f) => f.status !== "deleted" && f.purpose!=="completion")
      .forEach((f) => {
        const row = n("div", undefined, "list-row");
        row.append(n("p", f.room + " · " + f.filename + " · " + (f.status === 'ready' ? 'Verified' : 'Upload incomplete')));
        if (f.notes) row.append(n("p",f.notes,"fine"));
        if (f.status === "ready")
          row.append(
            btn(
              "Preview",
              async () => {
                try {
                  const data = await L.api("file", { query: { id: f.id } });
                  const win = n("dialog");
                  win.className = "live-auth";
                  const item = n(f.mime.startsWith("image/") ? "img" : "video");
                  item.src = data.url;
                  item.style.maxWidth = "100%";
                  if (item.tagName === "VIDEO") item.controls = true;
                  else item.alt = f.room;
                  const expired = n("p", "If the preview expires, close it and select Preview again for a fresh private link.","fine");
                  item.onerror = () => {expired.textContent="This preview could not load. Close it and select Preview again."};
                  win.addEventListener('close',()=>{if(item.tagName==='VIDEO')item.pause();win.remove();},{once:true});
                  win.append(
                    n("h3",f.room),item,expired,
                    btn("Close", () => {
                      win.close();
                      win.remove();
                    }),
                  );
                  document.body.append(win);
                  win.showModal();
                } catch (e) {
                  msg(e.message);
                }
              },
              "text-btn",
            ),
          );
        if (!b.invoice_issued && ["requested", "awaiting_walkthrough"].includes(b.status))
          row.append(
            btn(
              "Remove",
              () =>
                act(
                  () =>
                    L.api("upload-delete", {
                      method: "POST",
                      data: { id: f.id },
                    }),
                  "File removed; walkthrough review is required again.",
                ),
              "text-btn",
            ),
          );
        media.append(row);
      });
    if (!b.invoice_issued && ["requested", "awaiting_walkthrough"].includes(b.status)) {
      const file = input("file");
      file.accept = P31Workflow.inputTypes.join(',');file.required=true;
      const room = input();room.required=true;room.maxLength=100;
      room.placeholder="For example: kitchen or guest bathroom";
      const notes=n("textarea");notes.maxLength=2000;
      const preview=n("div",undefined,"upload-preview"),status=n("p"),progress=n("progress");
      status.setAttribute('role','status');progress.max=100;progress.value=0;progress.hidden=true;progress.setAttribute('aria-label','Walkthrough upload progress');
      let selectedFile=null,attempted=false,selection=0;
      file.onchange=async()=>{
        const token=++selection;const uploadButton=uploadForm.querySelector('button');uploadButton.disabled=true;
        clearPreviews();preview.replaceChildren();selectedFile=null;attempted=false;status.textContent='';progress.hidden=true;
        try {
          const chosen=await P31Workflow.prepareFile(file.files[0],(b.walkthrough_files || []).filter(f=>f.purpose!=="completion"),text=>{if(token===selection)status.textContent=text});if(token!==selection || !file.isConnected)return;selectedFile=chosen;
          const url=URL.createObjectURL(chosen);previewUrls.add(url);
          const item=n(chosen.type.startsWith('image/')?'img':'video');item.src=url;
          if(item.tagName==='VIDEO'){item.controls=true;item.preload='metadata';}else item.alt='Selected room photo';
          preview.append(item,n("p",chosen.name+' · '+(chosen.size/1024/1024).toFixed(1)+' MB',"fine"));
        } catch(error) {if(token===selection){status.textContent=error.message;file.value='';}}finally{if(token===selection)uploadButton.disabled=false;}
      };
      const uploadForm=form(media,[["Room",room],["Photo or video",file],["Room notes",notes]],"Upload securely",async()=>{
        const button=uploadForm.querySelector('button');
        try {
          if(!selectedFile)throw Error('Choose a supported room photo or video first.');
          if(!attempted)P31Workflow.validateFile(selectedFile,(b.walkthrough_files || []).filter(f=>f.purpose!=="completion"));
          attempted=true;progress.hidden=false;
          const saved=await act(()=>L.upload(b.id,selectedFile,room.value.trim(),notes.value,event=>{
            if(event.percent!==undefined)progress.value=event.percent;
            status.textContent=event.stage==='preparing'?'Preparing private upload…':event.stage==='uploading'?'Uploading · '+(event.percent || 0)+'%':event.stage==='verifying'?'Upload received. Verifying file…':'File verified.';
          }),"Walkthrough file uploaded and verified. Any earlier quote approval must be reviewed again.");
          if(!saved){button.textContent='Retry upload';status.textContent='Upload not completed. Keep this file selected and retry; your room notes are preserved.';}
        }catch(error){status.textContent=error.message;button.textContent='Retry upload';}
      });
      uploadForm.append(preview,progress,status,n("p","iPhone HEIC photos are converted to JPG on your device. Up to 6 files, 20 MB each and 80 MB total per booking. Avoid including people, IDs, payment details, or access codes in your photos.","fine"));
    }
    root.append(media);
    if(me.role!=="owner"){
      const payments=section("Payments & next steps");payments.dataset.checklistTarget="payments";
      payments.append(n("p","Starting-price deposit: "+money(b.quote_snapshot.deposit_cents)+" · Recorded deposit: "+money(b.deposit_paid_cents)));
      payments.append(n("p",b.invoice_issued?"Final balance: "+money(figures.balance):"Your final balance has not been issued yet."));
      payments.append(n("p","Contact Gabrielle to arrange payment or ask about a payment already sent. Online payment processing is not connected. Your checklist updates when Gabrielle records the payment."));
      const contact=n("a","Contact Gabrielle","outline");contact.href="contact.html";contact.target="_blank";contact.rel="noopener noreferrer";contact.setAttribute("aria-label","Contact Gabrielle (opens a new tab)");payments.append(contact);root.append(payments);
    }
    completionMedia(b,root);
    if (me.role === "owner") ownerDetail(b, root);
    if (!$("#workspace-dialog").open) $("#workspace-dialog").showModal();
    if(checklistTarget && checklistTarget!=="access"){
      const target=checklistTarget==='progress'?root.querySelector('[data-booking-progress]'):root.querySelector('[data-checklist-target="'+checklistTarget+'"]');
      if(target){target.scrollIntoView({block:"start"});const heading=target.querySelector('h2,h3');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}else{target.tabIndex=-1;target.focus({preventScroll:true});}}
    }
  }
  function completionMedia(b,root){
    const files=(b.walkthrough_files || []).filter(f=>f.purpose==='completion' && f.status!=='deleted');
    if(me.role!=='owner' && !files.length)return;
    const box=section('Cleaning completion photos & videos');
    box.append(n('p','Completion photos are optional and may be added after the visit is marked Completed. A verified upload can also complete a visit that is still in progress.','fine'));
    files.forEach(f=>{const row=n('div',undefined,'list-row');row.append(n('p',f.room+' · '+f.filename+' · '+(f.status==='ready'?'Verified':'Upload incomplete')));if(f.status==='ready')row.append(btn('Preview',async()=>{const data=await L.api('file',{query:{id:f.id}});const win=n('dialog',undefined,'live-auth'),item=n(f.mime.startsWith('image/')?'img':'video');item.src=data.url;if(item.tagName==='VIDEO')item.controls=true;else item.alt=f.room;win.append(n('h2','Cleaning completed'),item,btn('Close',()=>win.close()));win.addEventListener('close',()=>{if(item.tagName==='VIDEO')item.pause();win.remove();},{once:true});document.body.append(win);win.showModal();}));box.append(row);});
    if(me.role==='owner' && ['in_progress','completed'].includes(b.status)){
      const file=input('file'),room=input(),notes=n('textarea'),preview=n('div',undefined,'upload-preview'),status=n('p'),meter=n('progress');file.accept=P31Workflow.inputTypes.join(',');file.required=true;room.required=true;room.maxLength=100;notes.maxLength=2000;meter.max=100;meter.value=0;meter.hidden=true;meter.setAttribute('aria-label','Completion upload progress');status.setAttribute('role','status');let selected,attempted=false,selection=0;
      file.onchange=async()=>{const token=++selection,button=f.querySelector('button');button.disabled=true;preview.replaceChildren();selected=null;attempted=false;try{const chosen=await P31Workflow.prepareFile(file.files[0],files,text=>{if(token===selection)status.textContent=text});if(token!==selection || !file.isConnected)return;selected=chosen;const url=URL.createObjectURL(chosen);previewUrls.add(url);const item=n(chosen.type.startsWith('image/')?'img':'video');item.src=url;if(item.tagName==='VIDEO')item.controls=true;else item.alt='Post-cleaning photo';preview.append(item,n('p',chosen.name,'fine'));status.textContent='Ready to upload. Successful verification will complete this visit.';}catch(e){if(token===selection){file.value='';status.textContent=e.message;}}finally{if(token===selection)button.disabled=false;}};
      const f=form(box,[['Room / area completed',room],['Post-cleaning photo or video',file],['Completion notes',notes]],b.status==='completed'?'Add completion evidence':'Upload & mark Completed',async()=>{if(!selected)throw Error('Choose a completion photo or video.');if(!attempted)P31Workflow.validateFile(selected,files);attempted=true;meter.hidden=false;const saved=await act(()=>L.upload(b.id,selected,room.value.trim(),notes.value,event=>{if(event.percent!==undefined)meter.value=event.percent;status.textContent=event.stage==='complete'?'Completed':event.stage==='verifying'?'Verifying upload…':'Uploading completion evidence…';},'completion'),'Completion evidence verified. Visit marked Completed.');if(!saved){status.textContent='Upload did not complete. Retry the selected file.';f.querySelector('button').textContent='Retry completion upload';}});f.append(preview,meter,status);
    }
    root.append(box);
  }
  function ownerDetail(b, root) {
    const manage = section("Manage visit"),
      status = choice([
        ['', 'Choose a visit update'],['on_the_way','On the way'],['in_progress','Cleaning in progress'],['completed','Completed'],['cancelled','Cancelled']
      ], ''),
      reason = input();
    const approve=btn('Approve walkthrough & confirm booking',()=>act(()=>action(b,'approve_booking',{}),'Walkthrough approved. Booking confirmed.'));
    approve.disabled=!b.reviewed || b.deposit_paid_cents<b.quote_snapshot.deposit_cents || !['requested','awaiting_walkthrough'].includes(b.status);
    if(!b.access_signed_at)status.querySelector('option[value=on_the_way]').disabled=true;
    manage.append(n('p','Home-access authorization must be signed before On the way.','fine'));
    manage.append(n('p','Booked means the starting deposit is recorded. Confirm the walkthrough in the review section below. Travel and cleaning updates are manual.','fine'));
    form(
      manage,
      [
        ["Status", status],
        ["Reason (required for cancellation)", reason],
      ],
      "Save status",
      () =>
        act(
          () =>
            action(b, "status", { status: status.value, reason: reason.value }),
          "Booking status saved.",
        ),
    );
    if(b.property?.source==='owner_manual' && b.quote_status==='awaiting_approval'){
      const approval=n('textarea');approval.required=true;approval.maxLength=2000;
      form(manage,[['Customer approval received outside the website · how and when',approval]],'Record customer price approval',()=>act(()=>action(b,'external_approval',{notes:approval.value}),'Customer approval recorded.'));
    }
    const date = input("date", b.visit_date),
      window = choice([["", "Checking availability…"]], ""),
      why = input();
    let dateRequest=0;
    const loadArrival=async()=>{
      const request=++dateRequest;window.disabled=true;
      window.replaceChildren(Object.assign(n('option','Checking availability…'),{value:''}));
      try {
        const days=await L.api('availability',{query:{start:date.value,days:1}});
        if(request!==dateRequest)return;
        const slots=(days[0]?.slots || []).filter(slot=>slot.available || (date.value===b.visit_date && slot.id===b.arrival));
        window.replaceChildren();slots.forEach(slot=>window.append(Object.assign(n('option',arrivalName(slot.id)),{value:slot.id})));
        if(!slots.length)window.append(Object.assign(n('option','No available arrival blocks'),{value:''}));
        if(date.value===b.visit_date && slots.some(slot=>slot.id===b.arrival))window.value=b.arrival;
      }catch(error){if(request===dateRequest){msg(error.message);window.replaceChildren(Object.assign(n('option','Unable to check availability'),{value:''}));}}
      finally{if(request===dateRequest)window.disabled=false;}
    };
    date.onchange=loadArrival;window.required=true;loadArrival();
    date.required = true;
    why.required = true;
    form(
      manage,
      [
        ["Visit date", date],
        ["Arrival window", window],
        ["Change reason", why],
      ],
      "Reschedule visit",
      () =>
        act(
          () => {
            if(window.disabled || !window.value)throw Error('Choose a confirmed available arrival block.');
            return action(b, "reschedule", {date:date.value,arrival:window.value,reason:why.value});
          },
          "Visit rescheduled.",
        ),
    );
    (b.booking_requests || []).filter(r=>!r.resolved).forEach(r=>{
      const panel=section((r.kind==='cancel'?'Cancellation':'Rescheduling')+' request');
      panel.append(n('p',r.notes),n('p','Approving or declining this request does not add fees or change recorded payments.','fine'));
      const outcome=choice([['','Choose outcome'],['approved','Approve request'],['declined','Decline request']],''),notes=n('textarea'),date=input('date',b.visit_date),arrival=choice([['','Choose date']],'');
      outcome.required=true;notes.required=true;notes.maxLength=1000;
      let request=0;
      const load=async()=>{const token=++request;arrival.disabled=true;try{const days=await L.api('availability',{query:{start:date.value,days:1}});if(token!==request)return;arrival.replaceChildren();(days[0]?.slots || []).filter(slot=>slot.available || date.value===b.visit_date && slot.id===b.arrival).forEach(slot=>arrival.append(Object.assign(n('option',arrivalName(slot.id)),{value:slot.id})));if(!arrival.options.length)arrival.append(Object.assign(n('option','No available blocks'),{value:''}));}catch(e){msg(e.message);}finally{if(token===request)arrival.disabled=false;}};
      const fields=[['Decision',outcome],['Review notes for customer',notes]];
      if(r.kind==='reschedule'){fields.push(['Approved visit date',date],['Approved arrival block',arrival]);date.onchange=load;load();}
      const f=form(panel,fields,'Save request decision',()=>act(()=>{if(outcome.value==='approved' && r.kind==='reschedule' && (arrival.disabled || !arrival.value))throw Error('Choose an available arrival block.');return action(b,'review_request',{request_id:r.id,decision:outcome.value,notes:notes.value,date:date.value,arrival:arrival.value});},'Request decision saved. No automatic fees or refunds applied.'));
      if(r.kind==='reschedule'){const update=()=>{date.closest('label').hidden=arrival.closest('label').hidden=outcome.value!=='approved';};outcome.onchange=update;update();}
      manage.append(panel);
    });
    root.append(manage);
    const review = section("Review & final quote"),
      notes = n("textarea"),
      external = input("checkbox");
    notes.required = true;
    notes.value = b.review_notes || "";
    form(
      review,
      [
        ["Walkthrough review notes", notes],
        ["Walkthrough received separately", external],
      ],
      "Save walkthrough review",
      () =>
        act(
          () =>
            action(b, "review", {
              notes: notes.value,
              external: external.checked,
            }),
          "Walkthrough reviewed.",
        ),
    );
    review.append(approve);
    const adjustment = input(),
      cents = input("number");
    adjustment.required = true;
    cents.required = true;
    cents.step = ".01";
    form(
      review,
      [
        ["Adjustment description", adjustment],
        ["Amount in dollars (negative for credit)", cents],
      ],
      "Add adjustment",
      () =>
        act(
          () =>
            action(b, "adjust", {
              label: adjustment.value,
              cents: Math.round(Number(cents.value) * 100),
            }),
          "Adjustment saved; earlier quote approval has been reset.",
        ),
    );
    review.append(n("p","1. Review the walkthrough. 2. Explain any pricing adjustments. 3. Prepare the quote for customer approval. Completing the visit and issuing a balance require approval.","fine"));
    const prepare = btn("Prepare reviewed quote", () =>
        act(
          () => action(b, "prepare_quote", {}),
          "Quote prepared for customer approval. No email has been sent.",
        ));
    prepare.disabled=!b.reviewed || b.invoice_issued;
    review.append(prepare);
    const approval = input();
    approval.required = true;
    form(
      review,
      [["Approval received outside the portal", approval]],
      "Record customer approval",
      () =>
        act(
          () => action(b, "record_approval", { notes: approval.value }),
          "Approval recorded.",
        ),
    );
    const issue=btn("Issue final balance",()=>act(()=>action(b,"issue_invoice",{}),"Final balance issued. Email delivery is pending provider setup."));
    issue.disabled=!b.reviewed || b.quote_status!=='accepted' || b.status!=='completed' || b.final_cents===null || b.invoice_issued;
    review.append(issue);
    root.append(review);
    const pay = section("Record payment received"),
      amount = input("number"),
      kind = choice(
        [
          ["deposit", "Deposit"],
          ["final", "Final payment"],
        ],
        "deposit",
      ),
      method = input();
    amount.required = true;
    amount.min = ".01";
    amount.step = ".01";
    method.required = true;
    let key = crypto.randomUUID();
    form(
      pay,
      [
        ["Payment type", kind],
        ["Amount received in dollars", amount],
        ["Method / reference", method],
      ],
      "Record payment",
      async () => {
        if (
          await act(
            () =>
              action(
                b,
                "record_payment",
                {
                  kind: kind.value,
                  cents: Math.round(Number(amount.value) * 100),
                  method: method.value,
                },
                key,
              ),
            "Payment recorded. No charge was processed.",
          )
        )
          key = crypto.randomUUID();
      },
    );
    pay.append(
      n(
        "p",
        "Only record money actually received. The website does not process cards or automatically mark deposits paid.",
        "fine",
      ),
    );
    root.append(pay);
    if(!customers.find(c=>c.id===b.customer_id)?.account_enabled){
      const guest=section("Guest booking access"),notice=n("p","Create a private, one-use link for the booking’s contact email. It expires after 30 minutes and opens an eight-hour browser session. Creating a new link revokes earlier links and sessions. Share it only with this customer.");
      guest.append(notice);const output=n('div');
      guest.append(btn('Create private guest link',async()=>{try{const grant=await L.api('guest-invite',{method:'POST',data:{id:b.id}});output.replaceChildren(n('p','Recipient: '+grant.recipient+' · Expires '+new Date(grant.expires_at).toLocaleString("en-US", {timeZone: "America/New_York", timeZoneName: "short"})));const value=input('password',grant.url);value.readOnly=true;output.append(label('Private guest link',value),btn('Copy private link',async()=>{try{await navigator.clipboard.writeText(grant.url);notice.textContent='Private link copied. Share only with '+grant.recipient+'.';}catch{value.type='text';value.select();notice.textContent='Select and copy the private link. Share only with '+grant.recipient+'.';}}));}catch(e){notice.textContent=e.message;}}),btn('Revoke guest access',()=>act(async()=>{await L.api('guest-revoke',{method:'POST',data:{id:b.id}});output.replaceChildren();},'Guest links and browser sessions revoked.')),output);root.append(guest);
    }
    const privateNotes = section("Owner notes"),
      text = n("textarea");
    text.value = state.notes?.find((n) => n.booking_id === b.id)?.notes || "";
    form(
      privateNotes,
      [["Private owner notes", text]],
      "Save owner notes",
      () =>
        act(
          () =>
            L.api("owner-notes", {
              method: "POST",
              data: { id: b.id, notes: text.value },
            }),
          "Owner notes saved.",
        ),
    );
    root.append(privateNotes);
  }
  function renderCustomerDirectory(root) {
    const search=input("search",directorySearch),kind=choice([["all","All customers"],["account","Account customers"],["guest","Guest / manual customers"]],directoryKind);
    search.maxLength=120;search.placeholder="Name, email, phone, or address";search.autocomplete="off";
    const controls=section("Find a customer");
    controls.append(n("p","Search your saved customers, then open their contact details and booking history.","fine"));
    form(controls,[["Search customers",search],["Customer type",kind]],"Search",async()=>{directorySearch=search.value.trim();directoryKind=kind.value;directoryPage=0;workspaceDirty=false;await load();});
    controls.append(btn("Clear search",async()=>{directorySearch="";directoryKind="all";directoryPage=0;render();}));
    const results=n("div"),status=n("p","Loading customers…","fine");status.setAttribute("role","status");root.append(controls,status,results);
    async function load(){
      const request=++directoryRequest;status.textContent="Searching customers…";
      try{
        const packet=await L.api("customer-directory",{query:{search:directorySearch,kind:directoryKind,page:directoryPage}});
        if(request!==directoryRequest || view!=="Customers" || !root.contains(results))return;
        results.replaceChildren();status.textContent=packet.total+" customer"+(packet.total===1?"":"s")+" found";
        packet.items.forEach(c=>{const card=section(c.name);card.classList.add("customer-directory-card");card.append(n("p",c.email),n("p",c.phone || "Phone not provided","fine"),n("p",c.address || "Address not provided"),n("span",c.account_enabled?"Account customer":"Guest / manual customer","badge"),btn("View customer",()=>customerDetails(c)));results.append(card);});
        if(!packet.items.length)results.append(n("p",directorySearch || directoryKind!=="all"?"No customers match your search. Try another name, email, phone, or address.":"No customers yet. Bookings and saved profiles will appear here."));
        const pages=n("div",undefined,"detail-actions");if(directoryPage>0)pages.append(btn("Previous customers",async()=>{directoryPage--;await load();}));if((directoryPage+1)*packet.pageSize<packet.total)pages.append(btn("Next customers",async()=>{directoryPage++;await load();}));results.append(pages);
      }catch(e){if(request===directoryRequest && root.contains(results)){status.textContent=e.message;results.replaceChildren(btn("Retry customer search",load));}}
    }
    load();
  }
  function customerDetails(c) {
    $("#workspace-dialog").setAttribute("aria-label","Customer details");$("#workspace-dialog .dialog-header h2").textContent="Customer details";
    activeId=null;dialogDirty=false;const request=++customerDetailRequest,root=$("#workspace-detail");root.replaceChildren();$("#dialog-message").textContent="";
    const info=section(c.name);info.append(n("p",c.account_enabled?"Account customer":"Guest / manual customer","badge"));
    const fields=n("dl");for(const [title,value] of [["Email",c.email],["Phone",c.phone],["Address",c.address],["Access instructions",c.access_notes],["Pet notes",c.pet_notes]])fields.append(n("dt",title),n("dd",value || "Not provided"));info.append(fields,btn("Edit contact details",()=>editCustomer(c)),btn("Add booking for this customer",()=>manual(c),"primary"));root.append(info);
    const history=section("Booking history"),status=n("p","Loading booking history…","fine"),rows=n("div");status.setAttribute("role","status");history.append(status,rows);root.append(history);$("#workspace-dialog").showModal();let historyPage=0;
    async function load(){try{const packet=await L.api("customer-history",{query:{id:c.id,page:historyPage}});if(request!==customerDetailRequest || !root.contains(history) || !$("#workspace-dialog").open)return;status.textContent=packet.total+" booking"+(packet.total===1?"":"s");rows.replaceChildren();for(const b of packet.items){const card=section(labels[b.service] || b.service);card.append(n("p",b.visit_date+" · "+arrivalName(b.arrival)),n("p",statusLabel(b.status),"badge"),n("p",(b.final_cents===null?"Starting estimate*: ":"Reviewed total: ")+money(b.final_cents===null?b.quote_snapshot.total_cents:b.final_cents)),btn("Open booking",async()=>detail(await L.api("booking",{query:{id:b.id}}))));rows.append(card);}if(!packet.items.length)rows.append(n("p","No bookings for this customer yet."));const pages=n("div",undefined,"detail-actions");if(historyPage>0)pages.append(btn("Previous visits",async()=>{historyPage--;await load();}));if((historyPage+1)*packet.pageSize<packet.total)pages.append(btn("More visits",async()=>{historyPage++;await load();}));rows.append(pages);}catch(e){if(root.contains(history)){status.textContent=e.message;rows.replaceChildren(btn("Retry booking history",load));}}}
    load();
  }
  function editCustomer(c) {
    $("#workspace-dialog").setAttribute("aria-label","Customer details");$("#workspace-dialog .dialog-header h2").textContent="Customer details";
    activeId = null;
    const root = $("#workspace-detail");
    root.replaceChildren();
    const box = section("Customer details"),
      name = input("text", c.name),
      phone = input("tel", c.phone),
      address = input("text", c.address),
      access = n("textarea"),
      pets = n("textarea");
    name.required = true;
    access.value = c.access_notes || "";
    pets.value = c.pet_notes || "";
    box.append(
      n(
        "p",
        c.email +
          " · Sign-in email changes must be verified through authentication.",
        "fine",
      ),
    );
    form(
      box,
      [
        ["Name", name],
        ["Phone", phone],
        ["Address", address],
        ["Access instructions", access],
        ["Pet notes", pets],
      ],
      "Save contact details",
      () =>
        act(async () => {
          await L.api("customer", {
            method: "POST",
            data: {
              id: c.id,
              profile: {
                name: name.value,
                phone: phone.value,
                address: address.value,
                access_notes: access.value,
                pet_notes: pets.value,
              },
            },
          });
          $("#workspace-dialog").close();
        }, "Customer details saved."),
    );
    root.append(box);
    $("#workspace-dialog").showModal();
  }
  async function manual(prefill=null) {
    $("#workspace-dialog").setAttribute("aria-label","Manual booking");$("#workspace-dialog .dialog-header h2").textContent="Manual booking";
    let catalog;
    try { catalog = await L.api("catalog"); }
    catch (error) { msg(error.message); return; }
    const spaceChoices = service => catalog.spaces
      .filter(space => (service === "airbnb") === space.suite)
      .map(space => [space.id, space.label + " · from " + money(space.base_cents + (catalog.services.find(item => item.id === service)?.upgrade_cents || 0)) + "*"]);
    const root = $("#workspace-detail");
    root.replaceChildren();
    activeId = null;dialogDirty=false;
    const c = section("Add a manual booking"),
      firstName = input(),
      lastName = input(),
      email = input("email"),
      phone = input("tel"),
      address = input(),
      service = choice(catalog.services.map(item => [item.id, item.label]), "standard"),
      space = choice(spaceChoices("standard"), "3"),
      mode = choice(
        [
          ["Move-In", "Move-In"],
          ["Move-Out", "Move-Out"],
        ],
        "Move-In",
      ),
      price = input('number'),
      pricingStatus=choice([['starting','Starting estimate · walkthrough pending'],['awaiting_approval','Reviewed · awaiting customer approval'],['accepted_external','Approved with customer · record outside approval']], 'starting'),
      pricingNotes=n('textarea'),
      date = input("date"),
      arrival = choice([["", "Choose a date first"]], "");
    let availabilityRequest = 0;
    date.onchange = async () => {
      const request = ++availabilityRequest;
      arrival.replaceChildren(Object.assign(n("option", "Checking availability…"), { value: "" }));
      arrival.disabled = true;
      try {
        const rows = await L.api("availability", {
          query: { start: date.value, days: 1 },
        });
        if (request !== availabilityRequest) return;
        arrival.replaceChildren();
        (rows[0]?.slots || [])
          .filter((s) => s.available)
          .forEach((s) => {
            const o = n("option", arrivalName(s.id));
            o.value = s.id;
            arrival.append(o);
          });
        if (!arrival.options.length) {
          const o = n("option", "No open blocks");
          o.value = "";
          arrival.append(o);
        }
      } catch (e) {
        if (request !== availabilityRequest) return;
        arrival.replaceChildren(Object.assign(n("option", "Availability unavailable—choose the date again"), { value: "" }));
        msg(e.message);
      } finally {
        if (request === availabilityRequest) arrival.disabled = false;
      }
    };
    arrival.required = true;
    [firstName,lastName,email,address,date,price].forEach(i=>i.required=true);
    firstName.autocomplete='given-name';lastName.autocomplete='family-name';email.autocomplete='email';phone.autocomplete='tel';address.autocomplete='street-address';
    firstName.maxLength=100;lastName.maxLength=100;price.min='0.01';price.max='999999.99';price.step='0.01';price.inputMode='decimal';pricingNotes.maxLength=2000;
    const suggestPrice=()=>{price.value=((catalog.spaces.find(item=>String(item.id)===space.value)?.base_cents || 0)+(catalog.services.find(item=>item.id===service.value)?.upgrade_cents || 0))/100;};
    suggestPrice();space.onchange=suggestPrice;
    pricingStatus.onchange=()=>{pricingNotes.required=pricingStatus.value!=='starting';};
    service.onchange = () => {
      space.replaceChildren();
      const vals = spaceChoices(service.value);
      vals.forEach(([id, text]) => {
        const o = n("option", text);
        o.value = id;
        space.append(o);
      });
      suggestPrice();
      mode.closest("label").hidden=service.value!=="apartment";
    };
    const existing = choice(
      [
        ["", "New guest customer"],
        ...[...customers.filter(c=>c.id!==prefill?.id),...(prefill?[prefill]:[])].map((c) => [c.id, c.name + " · " + c.email]),
      ],
      "",
    );
    existing.onchange = () => {
      const saved = prefill?.id===existing.value?prefill:customers.find((c) => c.id === existing.value);
      if (saved) {
        const parts=saved.name.trim().split(/\s+/);firstName.value=parts.shift();lastName.value=parts.join(' ');
        email.value = saved.email;
        phone.value = saved.phone;
        address.value = saved.address;
      }
    };
    if(prefill){existing.value=prefill.id;existing.onchange();}
    let key = crypto.randomUUID();
    form(
      c,
      [
        ["Existing customer", existing],
        ["First name", firstName],
        ["Last name", lastName],
        ["Email", email],
        ["Phone", phone],
        ["Address", address],
        ["Service", service],
        ["Space", space],
        ["Apartment mode (if applicable)", mode],
        ["Visit date", date],
        ["Arrival block", arrival],
        ["Booking price ($)",price],
        ["Pricing status",pricingStatus],
        ["Pricing / customer approval notes",pricingNotes],
      ],
      "Save booking",
      () =>
        act(async () => {
          if (arrival.disabled || !arrival.value) throw new Error("Choose a confirmed available arrival block first.");
          await L.api("bookings", {
            method: "POST",
            data: {
              request_id: key,
              booking: {
                ...(existing.value ? { customer_id: existing.value } : {}),
                name: firstName.value.trim()+' '+lastName.value.trim(),
                first_name:firstName.value.trim(),last_name:lastName.value.trim(),
                manual_price_cents:Math.round(Number(price.value)*100),pricing_status:pricingStatus.value,pricing_notes:pricingNotes.value.trim(),
                email: email.value,
                phone: phone.value,
                address: address.value,
                service: service.value,
                space_id: Number(space.value),
                apartment_mode: mode.value,
                date: date.value,
                arrival: arrival.value,
                recurrence: { kind: "once" },
                focus: [],
                extras: {},
              },
            },
          });
          key = crypto.randomUUID();
          $("#workspace-dialog").close();
        }, "Manual booking created."),
    );
    mode.closest('label').hidden=service.value!=='apartment';
    c.prepend(n('p','Enter the scheduled visit and total service price. A starting estimate remains subject to review. Record customer approval only after it has actually been received; this does not record a payment.','fine'));
    root.append(c);
    $("#workspace-dialog").showModal();
  }
  $("#close-workspace-dialog").onclick = () => {
    activeId = null;
    clearPreviews();
    $("#workspace-dialog").close();
  };
  for(const event of ['input','change'])document.addEventListener(event,e=>{
    if(e.target.closest('#workspace-dialog'))dialogDirty=true;
    else if(e.target.closest('#workspace-content'))workspaceDirty=true;
  });
  $("#refresh").onclick = () => act(async () => {}, "Workspace refreshed.");
  try {
    const config = await L.init();
    if (!config.enabled || !config.authEnabled) {
      location.replace("sign-in.html");
      return;
    }
    const { data: { session } } = await L.client.auth.getSession();
    if (!session || session.user.is_anonymous) {
      location.replace("sign-in.html");
      return;
    }
    L.client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        autoSync?.stop();
        document.querySelector("#workspace-content").replaceChildren();
        document.querySelector("#workspace-detail").replaceChildren();
        location.replace("sign-in.html");
      }
    });
    me = await L.api("me");
    if (me.role === "guest")
      throw Object.assign(
        new Error(
          "Sign in with your email to manage an account. Guest bookings are confirmed by the company.",
        ),
        { status: 401 },
      );
    if (me.role === "owner") {
      const adminLink = n("a", "Admin dashboard");
      adminLink.href = "workspace.html";
      document.querySelector("header nav").prepend(adminLink);
    }
    $("#sign-out").hidden = false;
    $("#refresh").hidden = false;
    $("#workspace-role").textContent =
      me.role === "owner" ? "OWNER WORKSPACE" : "CUSTOMER WORKSPACE";
    $("#workspace-subtitle").textContent =
      me.role === "owner"
        ? "Your bookings, availability, and customer care."
        : "Your bookings and private walkthrough files.";
    const tabs =
      me.role === "owner"
        ? [
            "Bookings",
            "Walkthroughs",
            "Payments",
            "Customers",
            "Proverbs 31 Cal",
            "Availability",
            "Pricing",
            "Website content",
            "Forms & agreements",
            "Activity",
          ]
        : ["Bookings", "Walkthroughs", "Payments", "My Profile"];
    document.body.dataset.role=me.role;
    const iconPaths={Bookings:'M6 3h12v18H6z M9 8h6 M9 12h6 M9 16h4',Walkthroughs:'M3 6h18v14H3z M7 6l2-3h6l2 3 M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',Payments:'M3 5h18v14H3z M3 10h18 M7 15h3',Calendar:'M4 5h16v16H4z M8 3v4 M16 3v4 M4 11h16',Profile:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-3a8 8 0 0 1 16 0v3',More:'M5 12h.01 M12 12h.01 M19 12h.01'};
    const icon=(key)=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',iconPaths[key] || iconPaths.More);svg.append(path);return svg;};
    const selectView=(name)=>{
      view=name;
      const menu=$('#workspace-menu');if(menu.open)menu.close();
      window.scrollTo({top:0,behavior:'instant'});
      if(view==='Pricing')act(async()=>{pricing=await L.api('catalog');},'Pricing refreshed.');else if(view==='Website content')act(async()=>{siteContent=await L.api('site-content');},'Website content loaded.');else render();
      $('#workspace-title').focus({preventScroll:true});
      document.querySelectorAll('[data-mobile-view]').forEach(b=>b.setAttribute('aria-current',b.dataset.mobileView===view || b.dataset.mobileView==='More' && !['Bookings','Proverbs 31 Cal','Walkthroughs','Payments'].includes(view)?'page':'false'));
    };
    $('#dashboard-home').hidden=false;
    $('#dashboard-home').onclick=()=>selectView('Bookings');
    document.dispatchEvent(new CustomEvent('p31:authenticated'));
    tabs.forEach(name=>{const b=btn(name,()=>selectView(name));b.dataset.view=name;$('#workspace-nav').append(b);});
    const mobileTabs=me.role==='owner'?['Bookings','Proverbs 31 Cal','Walkthroughs','Payments','More']:tabs;
    mobileTabs.forEach(name=>{
      const short=({'Proverbs 31 Cal':'Calendar','My Profile':'Profile'})[name] || name;
      const b=btn('',()=>name==='More'?$('#workspace-menu').showModal():selectView(name));
      b.dataset.mobileView=name;b.setAttribute('aria-label',name==='More'?'More workspace options':name);
      b.append(icon(short),n('span',short));b.setAttribute('aria-current',name===view?'page':'false');$('#mobile-workspace-nav').append(b);
    });
    tabs.filter(name=>!mobileTabs.includes(name)).forEach(name=>$('#workspace-menu-options').append(btn(name,()=>selectView(name))));
    $('#close-workspace-menu').onclick=()=>$('#workspace-menu').close();
    $("#sign-out").onclick = async () => {
      await L.client.auth.signOut();
      location.replace("sign-in.html");
    };
    await reload();
    startWorkspaceSync();
  } catch (e) {
    $("#workspace-title").textContent =
      e.status === 401 ? "Sign in to continue" : "Workspace unavailable";
    msg(e.message);
    const a = n("a", "Sign in securely", "primary");
    a.href = "sign-in.html";
    $("#workspace-content").append(a);
  }
})();
