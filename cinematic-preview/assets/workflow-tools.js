window.P31Workflow = (() => {
  const types = ['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'];
  function validateFile(file, existing = []) {
    if (!file) throw Error('Choose a room photo or video.');
    if (!types.includes(file.type)) throw Error('Use JPG, PNG, WebP, MP4, WebM, or MOV. Export HEIC photos as JPG before uploading.');
    if (!file.size || file.size > 20 * 1024 * 1024) throw Error('Each file must be between 1 byte and 20 MB.');
    const active = existing.filter(item => item.status !== 'deleted');
    if (active.length >= 6) throw Error('This booking already has 6 files. Remove a file before adding another.');
    if (active.reduce((sum, item) => sum + Number(item.bytes || 0), 0) + file.size > 80 * 1024 * 1024) throw Error('The total walkthrough limit is 80 MB per booking. Remove a file or use a smaller video.');
    return true;
  }
  function totals(booking) {
    const starting = booking.quote_snapshot.total_cents;
    const adjustments = (booking.quote_adjustments || []).reduce((sum, item) => sum + item.cents, 0);
    const reviewed = booking.final_cents;
    const total = reviewed ?? starting + adjustments;
    const paid = booking.deposit_paid_cents + booking.final_paid_cents;
    return {starting,adjustments,total,reviewed,paid,balance:Math.max(0,total-paid),difference:total-starting};
  }
  function milestone(b){
    if(b.status==='cancelled')return -1;
    if(b.status==='completed')return 4;
    if(b.deposit_paid_cents<b.quote_snapshot.deposit_cents)return -1;
    if(!b.walkthrough_approved)return 0;
    return {confirmed:1,on_the_way:2,in_progress:3}[b.status] ?? 0;
  }
  return {validateFile,totals,types,milestone};
})();
