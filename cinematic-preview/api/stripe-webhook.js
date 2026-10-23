module.exports=require('../server/payments.cjs').createWebhookHandler();
module.exports.config={api:{bodyParser:false}};
