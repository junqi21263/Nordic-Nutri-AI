const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SERVER_EVENTS = new Set(['auth_completed','account_registered','onboarding_completed','vision_started','vision_terminal','meal_saved','meal_updated','meal_deleted','template_saved','template_used','nova_server_terminal','push_delivery_event','notification_read','feedback_submitted','reminder_updated']);
const DIAGNOSTIC_EVENTS = new Set(['client_error','native_diagnostic','google_credential_result']);
const EVENT_PROPERTIES = {
 web_page_view:['locale','campaign','channel','medium','content'],web_section_view:['section_key','locale','campaign','channel','medium','content'],
 web_demo_started:['demo_kind','sample_key','campaign','channel','medium','content'],web_demo_completed:['demo_kind','sample_key','campaign','channel','medium','content'],
 apk_download_clicked:['placement','release_version','campaign','channel','medium','content'],first_observed_open:['observation_origin'],
 app_foreground:['entry_kind'],session_start:['entry_kind'],screen_view:[],screen_engagement:['duration_ms'],auth_started:['method','entry'],
 google_credential_result:['outcome','error_type','stage'],scan_opened:['entry'],image_upload_result:['entry','outcome','error_code','duration_ms'],
 vision_result_viewed:[],vision_result_edited:['edited_fields'],meal_save_clicked:['entry'],
 nova_request_started:['entry'],nova_first_chunk:['first_chunk_ms'],nova_display_terminal:['outcome','reason','duration_ms','received_chunk_count'],
 notification_permission_result:['status'],feedback_reply_viewed:[],account_binding_result:['method','outcome','error_code'],
 update_checked:['from_version','target_version','outcome'],update_clicked:['from_version','target_version'],version_observed:['from_version','target_version'],
 client_error:['error_fingerprint','module','error_type','severity'],native_diagnostic:['error_fingerprint','stage','error_type'],
};
const FIELDS=new Set(['event_id','event_name','schema_version','occurred_at','session_id','anonymous_id','consent_revision','platform','app_version','build_code','page_key','operation_id','attempt_id','trace_id','properties']);
const ENUMS={
 method:['google','email','phone','wechat','unknown'],outcome:['succeeded','success','failed','completed','cancelled','user_cancelled','navigation_cancelled','background_cancelled','network_failed','timeout','protocol_error','provider_failed','unknown'],
 channel:['direct','xiaohongshu','douyin','wechat','google','other'],locale:['zh-CN','zh-TW','en'],
 medium:['social','search','direct','referral','other'],content:['launch_1','dev_test','other'],
 observation_origin:['existing_install','new_install','unknown'],demo_kind:['vision','nova'],
 sample_key:['salmon','rye','oats','default','prompt_1','prompt_2'],severity:['error','warning','fatal'],
 status:['granted','denied','prompt','unknown','enabled','disabled'],
};
function safeText(value,max=80){return typeof value==='string'&&value.length>0&&value.length<=max&&/^[a-zA-Z0-9_.:/-]*$/.test(value)&&!value.includes('://')&&!value.includes('@');}
function validateEvent(value,now=new Date()){
 const reject=reason=>({reason,event_id:UUID.test(value?.event_id)?value.event_id:null});
 if(!value||typeof value!=='object'||Array.isArray(value))return reject('EVENT_INVALID');
 if(Object.keys(value).some(key=>!FIELDS.has(key)))return reject('UNKNOWN_FIELD');
 if(SERVER_EVENTS.has(value.event_name))return reject('SERVER_EVENT_ONLY');
 if(!Object.hasOwn(EVENT_PROPERTIES,value.event_name))return reject('UNKNOWN_EVENT');
 if(value.schema_version!==1)return reject('SCHEMA_VERSION_INVALID');
 for(const key of ['event_id','session_id','anonymous_id','consent_revision'])if(!UUID.test(value[key]))return reject('ID_INVALID');
 for(const key of ['operation_id','attempt_id'])if(value[key]!==undefined&&!UUID.test(value[key]))return reject('ID_INVALID');
 if(!['android','web'].includes(value.platform)||!safeText(value.app_version,32)||!safeText(value.page_key,64))return reject('CONTEXT_INVALID');
 if(value.trace_id!==undefined&&!/^trace_[a-zA-Z0-9_-]{1,100}$/.test(value.trace_id))return reject('CONTEXT_INVALID');
 if(value.build_code!==undefined&&(!Number.isSafeInteger(value.build_code)||value.build_code<0))return reject('CONTEXT_INVALID');
 if(typeof value.occurred_at!=='string'||!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(value.occurred_at))return reject('TIMESTAMP_INVALID');
 const occurred=new Date(value.occurred_at),age=now.getTime()-occurred.getTime();
 if(!Number.isFinite(age)||age>72*3600000||age< -600000)return reject('TIMESTAMP_OUT_OF_RANGE');
 const properties=value.properties;
 if(!properties||typeof properties!=='object'||Array.isArray(properties)||Buffer.byteLength(JSON.stringify(properties))>1024)return reject('PROPERTIES_INVALID');
 for(const [key,p]of Object.entries(properties)){
  if(!EVENT_PROPERTIES[value.event_name].includes(key))return reject('UNKNOWN_PROPERTY');
  if(ENUMS[key]&&!ENUMS[key].includes(p))return reject('PROPERTY_INVALID');
  if(key==='campaign'&&!['official','launch','dev_test','organic','other'].includes(p))return reject('PROPERTY_INVALID');
  if(key==='edited_fields') {if(!Array.isArray(p)||p.length>8||p.some(x=>!['name','portion','ingredients','meal_type','nutrition'].includes(x)))return reject('PROPERTY_INVALID');}
  else if(/_ms$|_count$/.test(key)){if(!Number.isFinite(p)||p<0||p>86400000)return reject('PROPERTY_INVALID');}
  else if(!safeText(p,key==='error_fingerprint'?128:80))return reject('PROPERTY_INVALID');
 }
 if(value.platform==='web'&&!value.event_name.startsWith('web_')&&value.event_name!=='apk_download_clicked'&&!DIAGNOSTIC_EVENTS.has(value.event_name))return reject('PLATFORM_EVENT_INVALID');
 return {event:{...value,occurred_at:occurred.toISOString(),properties:{...properties}},diagnostic:DIAGNOSTIC_EVENTS.has(value.event_name)};
}
module.exports={UUID,SERVER_EVENTS,DIAGNOSTIC_EVENTS,EVENT_PROPERTIES,validateEvent};
