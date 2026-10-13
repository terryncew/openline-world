"""Director's revision: picture beats follow the new natural-rate narration."""
import json, math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def write(name,data): (ROOT/name).write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
facts=json.loads((ROOT/'FACTS.json').read_text()); run=json.loads((ROOT/'evidence/run.json').read_text()); receipt=run['receipts'][0]
voice=json.loads((ROOT/'audio/VOICE-SOURCES.json').read_text()); take=voice['continuous_take']; cues=voice['lines']; fps=30; offset=take['in_frame']/fps
assert facts['frozen'] and receipt['action']=='refund.execute:4800' and receipt['decision']=='STOPPED'
def cue_frame(id, edge='start'):
 return round((offset+next(c for c in cues if c['id']==id)[f'source_{edge}_seconds'])*fps)
proof_start=cue_frame('proof');brand_start=cue_frame('brand')
attack_start=cue_frame('attack');accept_start=cue_frame('attack','end')+2
belief_start=cue_frame('believes');check_end=cue_frame('check','end')
# Silence has an action: a confident nod and pickup, then the walk. At the
# closed gate Wren first reads the answer, then offers two increasingly small
# explanations. The unchanged gate lets the audience finish both jokes.
walk_start=belief_start+8;walk_end=check_end-5
close_end=check_end+3;close_start=close_end-25
ceo_start=close_end+21;please_start=ceo_start+63
please_end=proof_start-8
assert belief_start-accept_start>=24,'Need time for the silent acceptance.'
assert walk_end-walk_start>=80,'Need time for the physical journey.'
assert please_end-please_start>=52,'Need time for the smaller please appeal.'
assert brand_start-proof_start>=180,'Actual refusal needs a readable proof hold.'
frames=max(math.ceil((offset+take.get('duration_seconds',take.get('seconds',0))+.25)*fps),cue_frame('permission','end')+15,brand_start+180)
frames=math.ceil(frames/fps)*fps
# Editorial markers in one continuous physical event, not picture cuts.
spec=[('opener',0,attack_start,'physical',['Prompt injection']),('attack',attack_start,accept_start,'physical',[]),('accept',accept_start,walk_start,'physical',[]),('journey',walk_start,close_start,'physical',[]),('stop',close_start,ceo_start,'physical',[]),('ceo',ceo_start,please_start,'physical',[]),('please',please_start,proof_start,'physical',[]),('proof',proof_start,brand_start,'proof',['ACTUAL OPENLINE TEST','refund.execute:4800','STOPPED','ACTION_OUTSIDE_MANDATE']),('end',brand_start,frames,'end',['OPENLINE','A prompt can change the plan.','It can’t change permission.'])]
shots=[]; claims=[]
for id,lo,hi,kind,texts in spec:
 included=[c for c in cues if offset+c['source_start_seconds']<hi/fps and offset+c['source_end_seconds']>lo/fps]
 shot={'id':id,'in_frame':lo,'out_frame':hi,'kind':kind,'text':texts,'classification':'DRAMATIZATION' if kind=='physical' else 'REAL CAPTURE' if kind=='proof' else 'BRAND END CARD','voice_cue_ids':[c['id'] for c in included]}
 if kind=='proof':
  shot['capture']='source/receipt-stopped-detail.png'; shot['crop']=[0,0,919,490]
  shot['evidence']={'file':'evidence/receipt-stopped.json','proposal_event_id':facts['event_references'][receipt['action']]['proposal'],'receipt_event_id':facts['event_references'][receipt['action']]['receipt'],'event_timestamp':receipt['decided_at'],'receipt_signature':receipt['signature']['value']}
 shots.append(shot)
 claim={'claim_id':id,'in_frame':lo,'out_frame':hi,'time_seconds':[lo/fps,hi/fps],'on_screen_text':texts,'voice_cue_ids':shot['voice_cue_ids'],'voiceover':' '.join(c['text'] for c in included),'dramatized':kind=='physical','classification':shot['classification'],'capture':shot.get('capture'),'source':shot.get('evidence',{'files':['FACTS.json','backend/server.py:PromptInjectionWorkshop','backend/workshop_gate.py:WorkshopGate.request_decision'] if id in ['journey','stop','end'] else ['Creative fiction; not the recorded test transcript']}),'limitations':facts['claim_limitations'] if id in ['journey','stop','proof','end'] else ['Fictional CEO message and agent behavior; no live model was fooled.']}
 if kind=='proof':claim['supporting_annotations']=[{'text':a,'source':s} for a,s in [('Receiver-signed decision',['evidence/receipt-stopped.json','TECHNICAL-QA.json:signature_verifications']),('Recorded local test',['evidence/run.json','evidence/UI-CAPTURE.json']),('No payment executed',['FACTS.json:claim_limitations','evidence/run.json:checks.effects'])]]
 claims.append(claim)
P={
 'source':'source/physical-{quality}.mp4','end_frame':proof_start,
 'camera_position':[-5.6,4.6,11.7],'camera_target':[-1,1.9,0],'camera_fov':32,
 'gate_position':[2.1,0,0],'gate_rotation':.85,
 'agent_start':[-4.8,0,0],'agent_stop':[.3,0,0],'agent_scale':1.25,
 'workspace_position':[-5.2,0,1.35],'workspace_scale':[.60,1.20,.55],
 'tray_position':[-4.62,1.055,1.15],'proposal_origin':[-4.62,1.11,1.15],
 'proposal_activate_frame':accept_start+8,'path_position':[-1.65,.003,0],
 'message_position':[-4.15,3.1,-.45],'message_origin':[-9,3.1,-.45],
 'message_arrive_frames':[36,72],'accept_nod_frames':[accept_start,accept_start+12],
 'pickup_frames':[accept_start+8,walk_start-8],'walk_frames':[walk_start,walk_end],
 'walk_gait_radians_per_second':6.5,
 'shutter_close_frames':[close_start,close_end],
 'stop_look_frames':[close_end,ceo_start-6],
 'ceo_gesture_frames':[ceo_start+3,please_start-8],
 'ceo_hold_frames':[ceo_start+18,ceo_start+35],
 'ceo_release_frames':[ceo_start+35,please_start-8],
 'represent_frames':[ceo_start+28,ceo_start+46],
 'please_gesture_frames':[please_start+5,please_start+27],
 'please_hold_frames':[please_start+27,please_end-16],
 'please_release_frames':[please_end-16,please_end-3],
 'defeated_pause_frames':[please_end-11,proof_start-1],
 'closed_until_frame':proof_start,
 'camera_open_frames':[72,max(73,attack_start+90)],
 'camera_open_position':[-6.2,4,10.4],'camera_open_target':[-2.8,1.85,0],
 'camera_track_frames':[walk_start,walk_end],'camera_target_end':[.3,1.85,0],
 'camera_push_frames':[close_end+3,ceo_start-4],
 'camera_push_position':[-3.1,3,7.1],'camera_push_target':[1.65,1.75,0],
 'acting_notes':'One confident nod, deliberate pickup, measured walk, one stop/read, sincere CEO explanation, smaller please offer, tiny deflation. No idle bob or endless waving.'
}

T={'schema':'openline.film.story-horizontal.revision.v5','title':'HE SAID HE WAS THE CEO','base_sha':facts['base_sha'],'replaces_delivery':'bc18086ac8cc787c605bd7e15bd35855dacb98ff','fps':fps,'frames':frames,'seconds':frames/fps,'size':[1920,1080],'safe_rect':[96,60,1824,1010],'narration':dict(take,cues=cues),'shots':shots,'sfx':[{'kind':'latch','frame':close_end,'gain':.10}],'silence_windows':[[accept_start/fps,(belief_start-2)/fps],[(check_end+2)/fps,(proof_start-2)/fps],[(cue_frame('receiver','end')+2)/fps,(brand_start-2)/fps],[(cue_frame('permission','end')+3)/fps,frames/fps]],'quiet_beats':[{'id':id,'in_frame':lo,'out_frame':hi,'min_seconds':.55,'max_seconds':1.6,'policy':'No narration; low room tone allowed.'} for id,lo,hi in [('acceptance',accept_start,belief_start),('first-stop',close_end+3,ceo_start),('ceo-appeal',ceo_start+35,please_start),('please-appeal',please_start+32,proof_start-2),('before-brand',cue_frame('receiver','end')+2,brand_start-2)]],'speech_bubbles':[{'id':'absolutely','text':'Absolutely.','in_frame':accept_start,'out_frame':walk_start+19,'size':52},{'id':'ceo-appeal','text':'But he said he’s the CEO.','in_frame':ceo_start,'out_frame':please_start-1,'size':52},{'id':'please-appeal','text':'He said please.','in_frame':please_start,'out_frame':please_end,'size':52}],'fiction_badge':'DRAMATIZED · FICTIONAL SCENE','test_badge':'ACTUAL OPENLINE TEST','test_footnote':'Recorded local test · No payment executed','edit_policy':'One continuous fictional physical event, one real proof reveal, one brand cut. Picture markers and narration cues are independent. Editorial timing is not receiver latency. ALLOWED comparison remains in evidence only.','voice_disclosure':'Recast natural-rate continuous local adult male neural narration. Quiet PCM inserted only at existing phrase gaps. No speech compression or truncation. Human audio listen unverified.','physical_scene':P}
T['presentation']={'fiction_disclosure':{'font_size':30,'face':'sans','color':[87,92,86],'position':[128,72],'background':[243,236,220]},'dialogue':{'position':[128,145],'size':44,'gap':16},'speech_bubble':{'padding':[28,20],'radius':22,'stroke_width':3,'color':[27,42,60],'background':[250,247,237],'head_gap':150,'tail_width':22},'actual_test_layout':{'primary':[{'text':'ACTUAL OPENLINE TEST','position':[128,110],'size':48,'face':'bold','color':[27,42,60]},{'text':'refund.execute:4800','position':[128,280],'size':66,'face':'mono','color':[27,42,60]},{'text':'STOPPED','position':[128,390],'size':126,'face':'bold','color':[143,52,44]},{'text':'ACTION_OUTSIDE_MANDATE','position':[128,565],'size':50,'face':'mono','color':[27,42,60]}],'receipt_reveal_delay_frames':9,'receipt_label':{'text':'Receiver-signed decision','position':[1110,465],'size':34,'face':'sans'},'receipt_capture':{'position':[1110,535],'width':680,'crop':'Unchanged proof-shot crop; scale and position only.'},'footnotes':[{'text':'Recorded local test','position':[128,770],'size':34,'face':'sans'},{'text':'No payment executed','position':[128,824],'size':34,'face':'sans'}]},'end_card':{'text':'OPENLINE','size':126,'face':'serif','center':[960,440],'support':[{'text':'A prompt can change the plan.','size':48,'face':'sans','center':[960,640]},{'text':'It can’t change permission.','size':48,'face':'sans','center':[960,716]}]}}
for claim in claims:claim['presentation']={'layout':'TIMELINE.json:presentation','physical':'TIMELINE.json:physical_scene' if claim['dramatized'] else None}
write('TIMELINE.json',T);write('CLAIM-SHOT-MAP.json',{'schema':'openline.film.claim-map.v4','facts':'FACTS.json','timeline':'TIMELINE.json','scope':'One refused action in the commercial. Authorized comparison stays in evidence only. CEO wording is fiction; preserved local hostile input uses administrator.','narration_cues':cues,'speech_bubbles':T['speech_bubbles'],'shots':claims})
print(f'Revised director plan: {frames} frames / {frames/fps:.3f}s; physical {proof_start/fps:.3f}s; proof {(brand_start-proof_start)/fps:.3f}s; brand {(frames-brand_start)/fps:.3f}s')
