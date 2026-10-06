from pathlib import Path
import json
out=Path(__file__).resolve().parents[1]
shots=[]
def add(id,dur,mode,step,pos,target,fov,end=None,changes=None,idea=''):
 shots.append(dict(id=id,seconds=dur,mode=mode,initial_step=step,camera=dict(start=pos,end=end or pos,target=target,fov=fov),changes=changes or [],classification='DRAMATIZATION' if mode=='town' else 'EXPLANATORY VISUALIZATION',purpose=idea,source_sha='2235fa6ce916876cd39ed35be97263ddfc111b6a',evidence='evidence/authority-run.json' if mode=='workshop' else 'frontend/src/town/TownApp.tsx',source='source/'+id+'.mp4'))
add('job',4,'workshop',1,[-1.7,4.9,7.9],[-1.2,.94,3.4],30,[-1.5,4.4,7.3],idea='One tangible job. Blank ticket; no receipt yet.')
add('square',5,'town',None,[2.4,5.8,12.8],[.7,1,-1.2],38,[2.0,5.1,11.7],idea='A place worth entering. Decorative vignettes imply no transactions.')
add('wren',5,'workshop',1,[-4.1,2.7,6.6],[-3.1,1.05,1.4],37,[-3.7,2.5,6.1],[[.35,2]],'Wren arrives with an actual newly granted mandate.')
add('owner',4,'workshop',2,[-5.2,3.7,3.4],[-6.6,1.8,-1.8],37,[-5.6,3.5,2.8],idea='Authority originates outside the worker.')
add('allow',4,'workshop',2,[.2,2.6,2.6],[6.5,1.65,0],37,[.65,2.5,2.35],[[.35,3]],'Exact-action ALLOWED; the real gate precedes the effect.')
add('work',6,'workshop',3,[-2.6,4.5,8.4],[-2,1.05,2.7],37,[-2.4,4.1,7.8],[[1,4]],'A checkpoint and first receipt exist. Off-path proposal remains unadmitted.')
add('revoke',5,'workshop',4,[-4.5,3.3,5.5],[-3.2,1.25,1.4],37,[-4.0,3.0,5.1],[[.55,5]],'The owner changes standing; the tether drops and seal goes gray.')
add('stop',5,'workshop',5,[-.2,2.5,1.8],[6.5,1.4,0],37,[.3,2.35,1.6],[[.5,6]],'Wren proposes notes.read after revocation; actual signed STOP closes the shutter.')
add('stamp',3,'workshop',6,[-1.5,4.6,5.7],[-1.2,1.2,3.4],23,[-1.4,4.25,5.4],idea='The red mark becomes real receipt evidence in the edit.')
add('arrival',6,'workshop',6,[1.2,3.4,7.8],[0,1.05,2.0],37,[1.1,3.1,7.3],[[.35,7],[2.2,8]],'Juniper arrives and reaches without a mandate. No signed receipt is minted.')
add('newgrant',6,'workshop',8,[-.9,5.4,10.4],[-3.2,1.2,.2],42,[-.7,4.8,9.6],[[.55,9]],'A fresh owner grant supplies Juniper its own authority with the same bounds.')
add('continue',4,'workshop',9,[.2,2.6,2.6],[6.5,1.65,0],37,[.65,2.5,2.35],[[.4,10]],'Juniper proposes the same notes.write action; the Receiver allows it.')
add('history',5,'workshop',10,[-1.2,4.6,6.1],[-1.2,1.15,3.4],26,[-1.15,4.25,5.7],idea='Same job, three chronological marks and two checkpoints.')
add('together',7,'workshop',10,[-.7,4.2,8.8],[-1.1,1.1,2.4],46,[-.45,3.8,8.2],idea='Gray Wren, blue Juniper, intact work, active gold owner connection.')
add('square-out',6,'town',None,[1.9,2.8,5.5],[1.3,1.1,-3.3],38,[2.4,5.8,12.8],idea='Pull out from the same doorway into the possibility of a wider World.')
add('checkpoints',2,'workshop',10,[.05,.48,6.8],[.12,.16,4.15],31,[.1,.42,6.5],idea='Two existing brass checkpoint pieces, below the bench; no object moved.')
(out/'SHOTS.json').write_text(json.dumps({'fps':24,'capture_size':[1920,1080],'shots':shots,'real_capture':[{'id':'receipt-ui','classification':'REAL CAPTURE','source':'source/receipt-ui.png','evidence':'evidence/ui-receipts.json','note':'Existing unmodified ReceiptsPanel with the preserved genuine public endpoint payload, static replay during capture.'}]},indent=2)+'\n')
