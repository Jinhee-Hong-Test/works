// No browser dependencies: transport and durable storage are supplied by the UI.
class SyncEngine {
  constructor({read, write, persist, apply, status, uuid, initial}) {
    Object.assign(this, {read, write, persist, apply, status, uuid});
    this.state = initial || {revision:0, payload:null, pending:null};
    this.busy = false;
    this.conflict = false;
  }
  change(payload) {
    const next = {...this.state, payload, dirty:true};
    this.persist(next); // Never claim a queued write unless it is durable.
    this.state = next;
    this.status(this.conflict ? 'conflict' : 'pending');
  }
  async tick() {
    if(this.busy || this.conflict) return;
    this.busy = true;
    try {
      if(this.state.dirty || this.state.pending) {
        if(!this.state.pending) {
          const next = {...this.state, pending:{revision:this.state.revision, payload:this.state.payload, id:this.uuid()}};
          this.persist(next); this.state=next;
        }
        const pending=this.state.pending;
        const row=await this.write(pending);
        const changed=JSON.stringify(this.state.payload)!==JSON.stringify(pending.payload);
        const next={...this.state, revision:row.revision, pending:null, dirty:changed};
        this.persist(next); this.state=next;
        this.status(changed?'pending':'synced');
      } else {
        const row=await this.read();
        // A local edit during the read must never be overwritten.
        if(this.state.dirty || this.state.pending) return;
        if(row.revision!==this.state.revision || this.state.payload===null) {
          const next={revision:row.revision,payload:row.payload,pending:null,dirty:false};
          this.apply(row.payload); this.persist(next); this.state=next;
        }
        this.status('synced');
      }
    } catch(e) {
      if(e.conflict) {this.conflict=true;this.status('conflict');}
      else this.status(e.auth?'auth':e.forbidden?'forbidden':'offline');
    } finally {this.busy=false;}
  }
  async useServer() {
    if(this.busy) throw Error('Sync in progress');
    this.busy=true;
    try {
      const row=await this.read();
      const next={revision:row.revision,payload:row.payload,pending:null,dirty:false};
      this.apply(row.payload);this.persist(next);this.state=next;this.conflict=false;this.status('synced');
    } finally {this.busy=false;}
  }
}

window.PWorksSyncEngine = SyncEngine;
