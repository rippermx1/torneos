using UnityEngine;
namespace Orbit.AlienRun
{
    public sealed class SpikeTrap : MonoBehaviour
    {
        public RunSession session;
        public Transform spikes;
        public Collider danger;
        public float period=3.6f;
        public float phaseOffset;
        public float retractDistance=1.15f;
        private Vector3 raised;
        private float started;
        public bool Extended {get;private set;}
        private void Awake(){raised=spikes.localPosition;started=Time.time;}
        public void ResetForRun(){started=Time.time;Extended=false;danger.enabled=false;spikes.localPosition=raised+Vector3.down*retractDistance;}
        private void Update()
        {
            if(session==null || spikes==null || danger==null)return;
            if(!session.PlayerVulnerable){danger.enabled=false;return;}
            var phase=Mathf.Repeat(Time.time-started+phaseOffset,period)/period;
            var amount=phase<.42f?0f:phase<.55f?Mathf.InverseLerp(.42f,.55f,phase):phase<.85f?1f:1f-Mathf.InverseLerp(.85f,1,phase);
            Extended=amount>.5f;
            spikes.localPosition=raised+Vector3.down*(retractDistance*(1-amount));
            if(phase>.32f && phase<.42f)spikes.localPosition+=Vector3.up*(Mathf.Sin(Time.time*42)*.07f);
            danger.enabled=Extended;
            if(!Extended || !session.PlayerVulnerable)return;
            var player=session.runner.GetComponent<CharacterController>();
            if(Physics.ComputePenetration(danger,danger.transform.position,danger.transform.rotation,player,player.transform.position,player.transform.rotation,out _,out _)){
#if UNITY_EDITOR || DEVELOPMENT_BUILD
                Debug.Log(name+" spike hit at "+player.transform.position+" bounds "+danger.bounds);
#endif
                session.Respawn();
            }
        }
    }
}
