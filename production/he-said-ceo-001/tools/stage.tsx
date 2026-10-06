/** Read-only recorded-test stage: original components, exact recovered public data. */
import React from 'react';
import {createRoot} from 'react-dom/client';
import {EventFeed,ReceiptsPanel} from '../../../frontend/src/components/Panels';
import '../../../frontend/src/styles.css';
fetch('../evidence/run.json').then(r=>r.json()).then(run=>{
  const proposal=run.events.find(e=>e.kind==='proposal'&&e.detail.action==='refund.execute:4800');
  createRoot(document.getElementById('root')!).render(<><EventFeed events={[proposal]}/><ReceiptsPanel onClose={()=>{}}/></>);
});
