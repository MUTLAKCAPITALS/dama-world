// Real libwebrtc peer connections + real Firebase SDK clients against loopback rules.
// Synthetic PCM replaces physical microphones. This is not a two-browser/device acceptance test.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {initializeTestEnvironment}=require('@firebase/rules-unit-testing');
const firebase=require('firebase/compat/app');require('firebase/compat/firestore');firebase.firestore.setLogLevel('silent');
const rtc=require(process.env.VOICE_WRTC_MODULE||'@roamhq/wrtc');
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8181')throw Error('Loopback emulator required');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(root+'/dev/voice.js','utf8'),rules=fs.readFileSync(root+'/firestore.rules','utf8');
const owner=rules.match(/request\.auth\.token\.email == '([^']+)'/)[1],clients=[],nativePCs=[],sources=[],sinks=[],timers=new Set();let env,passed=0;
function wire(v){if(Array.isArray(v))return Array.from(v,wire);if(v&&typeof v==='object'&&v.constructor?.name==='Object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,wire(x)]));return v}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,label,ms=10000){const end=Date.now()+ms;while(Date.now()<end){if(check())return;await sleep(40)}console.error('RTC STATE',JSON.stringify(clients.map(w=>({uid:w.uid,peers:[...w.state.peers.values()].map(p=>({uid:p.uid,offerer:p.offerer,state:p.pc.connectionState,ice:p.pc.iceConnectionState,gather:p.pc.iceGatheringState,local:p.pc.localDescription?.type,remote:p.pc.remoteDescription?.type,got:p.got.size,queued:p.ice.length,latest:!!p.latest,signaling:p.signaling}))}))));throw Error(label+' timed out: '+clients.map(x=>x.uid+': '+x.c.voiceStatus()).join(' | '))}
function checked(name){passed++;console.log('PASS',name)}
function client(uid,name,frequency){const db=env.authenticatedContext(uid,{firebase:{sign_in_provider:'password'}}).firestore(),outputs=[];let captures=0;
 const sdk={collection:n=>db.collection(n),runTransaction:f=>db.runTransaction(tx=>f({get:r=>tx.get(r),set:(r,v)=>tx.set(r,wire(v)),update:(r,v)=>tx.update(r,wire(v)),delete:r=>tx.delete(r)}))};
 function tone(){captures++;const src=new rtc.nonstandard.RTCAudioSource(),track=src.createTrack(),stream=new rtc.MediaStream([track]);sources.push(track);let phase=0;const timer=setInterval(()=>{if(track.readyState==='ended')return;const samples=new Int16Array(480);for(let i=0;i<480;i++)samples[i]=Math.round(Math.sin((phase++)*2*Math.PI*frequency/48000)*8000);src.onData({samples,sampleRate:48000,bitsPerSample:16,channelCount:1,numberOfFrames:480})},10);timers.add(timer);return stream}
 function audio(){const a={muted:false,heard:0,energy:0,frames:0,setAttribute(){},play:async()=>{},pause(){},remove(){if(this.sink)this.sink.stop()},set srcObject(stream){if(this.sink)this.sink.stop();this.stream=stream;if(!stream)return;this.sink=new rtc.nonstandard.RTCAudioSink(stream.getAudioTracks()[0]);sinks.push(this.sink);this.sink.ondata=d=>{this.frames++;let power=0;for(const x of d.samples)power+=Math.abs(x);this.energy=power/d.samples.length;if(!this.muted&&this.energy>100)this.heard++}},get srcObject(){return this.stream}};outputs.push(a);return a}
 const c=vm.createContext({console,Date,Math,JSON,Set,Map,Array,Number,Object,String,Promise,Uint8Array,crypto:require('node:crypto').webcrypto,
   setTimeout,clearTimeout,setInterval:(f,ms)=>{const t=setInterval(f,ms);timers.add(t);return t},clearInterval,
   RTCPeerConnection:function(){const pc=new rtc.RTCPeerConnection({iceServers:[],bundlePolicy:'max-bundle'});nativePCs.push(pc);return pc},MediaStream:rtc.MediaStream,
   window:{RTCPeerConnection:rtc.RTCPeerConnection},document:{hidden:false,body:{appendChild(){}},createElement:audio},navigator:{onLine:true,mediaDevices:{getUserMedia:async()=>tone()}},
   ONL:{db:sdk,code:'ABCD',room:{state:'play',matchId:'voice-match'},ref:{},role:uid==='a'?'host':'guest'},ACC:{name,key:name.toLowerCase(),synced:true},CTL:{mute:false,ban:false},
   S:{country:'kw',settings:{mic:false,matchVoice:false,oppVoice:true}},mode:'explore',LOBBY:{on:false},game:{online:{},over:false},rsUid:()=>uid,rcBlocked:()=>false,requirePlayAccount:()=>true,toast:msg=>console.log('VOICE',uid,msg),$ :()=>null,ic:()=>'',firebase});
 vm.runInContext(source,c);c.voiceUI=()=>{};const state=vm.runInContext('VC',c),w={uid,c,state,outputs,captures:()=>captures};clients.push(w);return w;
}
let finished=false;async function finish(){if(finished)return;finished=true;for(const w of clients)w.c.voiceStop();await Promise.all(clients.map(w=>w.state.releasing));for(const t of timers)clearInterval(t);for(const s of sinks)try{s.stop()}catch{}for(const t of sources)t.stop();for(const p of nativePCs)p.close();if(env)await env.cleanup();await sleep(200)}
(async()=>{env=await initializeTestEnvironment({projectId:'demo-dama-world-rules',firestore:{host:'127.0.0.1',port:8181,rules}});await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{const b=c.firestore().batch();for(const [uid,name]of [['a','Alice'],['b','Bobby'],['x','Third']])b.set(c.firestore().doc('names/'+name.toLowerCase()),{uid,name,at:1});b.set(c.firestore().doc('rooms/ABCD'),{host:'a',guest:'b',state:'play',matchId:'voice-match'});await b.commit()});
try{
 const a=client('a','Alice',440),b=client('b','Bobby',880);
 await Promise.all([a.c.voiceJoin('voiceWorlds','kw_1'),b.c.voiceJoin('voiceWorlds','kw_1')]);
 await until(()=>a.state.peers.get('b')?.state==='connected'&&b.state.peers.get('a')?.state==='connected','world connected');
 assert.equal(a.captures()+b.captures(),0);checked('real WebRTC: world channel connects two Firebase clients with microphones initially closed');
 await Promise.all([a.c.voiceMic(),b.c.voiceMic()]);await until(()=>a.outputs.some(x=>x.heard>15)&&b.outputs.some(x=>x.heard>15),'bidirectional decoded PCM');checked('real WebRTC: both world players receive nonzero decoded audio over SRTP');
 const third=client('x','Third',1320);await third.c.voiceJoin('voiceWorlds','kw_1');await third.c.voiceMic();
 await until(()=>[a,b,third].every(w=>w.outputs.filter(x=>x.heard>15).length===2),'three-player mesh');checked('real WebRTC: three world participants exchange distinct live audio streams');
 a.c.voiceMicOff();await until(()=>b.outputs.every(x=>x.energy<100||x===b.state.peers.get('x')?.audio),'mic silence');assert.equal(a.state.local,null);checked('real WebRTC: closing microphone stops source and the other player receives silence');
 await a.c.voiceMic();await until(()=>b.state.peers.get('a')?.audio.energy>100,'reopen microphone');checked('real WebRTC: microphone reopens with replaceTrack without renegotiating the call');
 const admin=env.authenticatedContext('owner',{email:owner,email_verified:true,firebase:{sign_in_provider:'google.com'}}).firestore();await admin.doc('voiceControls/a').set({mute:true,ban:false,at:firebase.firestore.FieldValue.serverTimestamp()});await until(()=>b.state.peers.get('a')?.audio.muted&&third.state.peers.get('a')?.audio.muted,'admin mute');const heard=b.state.peers.get('a').audio.heard;await sleep(200);assert.equal(b.state.peers.get('a').audio.heard,heard);checked('real WebRTC: owner mute immediately suppresses playback at both other peers');
 for(const w of [a,b,third])w.c.voiceStop();await Promise.all([a,b,third].map(w=>w.state.releasing));assert([a,b,third].every(w=>w.state.peers.size===0&&!w.state.local));checked('real WebRTC: world exit closes every connection, track and Firebase lease');
 await admin.doc('voiceControls/a').set({mute:false,ban:false,at:firebase.firestore.FieldValue.serverTimestamp()});
 for(const w of [a,b]){w.c.mode='match';w.outputs.length=0}await Promise.all([a.c.vcStart(),b.c.vcStart()]);await until(()=>a.state.peers.get('b')?.state==='connected'&&b.state.peers.get('a')?.state==='connected','match connected');
 await Promise.all([a.c.voiceMic(),b.c.voiceMic()]);await until(()=>a.outputs.some(x=>x.heard>15)&&b.outputs.some(x=>x.heard>15),'match audio');checked('real WebRTC: private match seats negotiate and carry decoded audio both directions');
 b.c.S.settings.oppVoice=false;b.c.voiceAudio(b.state.peers.get('a'));assert(b.state.peers.get('a').audio.muted);checked('real WebRTC: opponent speaker control affects actual playback');
 b.c.document.hidden=true;b.c.voiceTick();await until(()=>a.state.peers.size===0,'hidden peer cleanup');assert(!b.state.local);checked('real WebRTC: backgrounding a player closes capture and removes the remote connection');
}finally{await finish()}console.log(`Real voice media: ${passed} passed. Native WebRTC + synthetic PCM; physical devices/browsers not verified.`);
})().then(()=>{process.exit(0)},async e=>{console.error(e);await finish();process.exit(1)});
