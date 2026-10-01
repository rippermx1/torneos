using UnityEngine;
namespace Orbit.AlienRun
{
    [RequireComponent(typeof(Rigidbody))]
    public sealed class MovingPlatform : MonoBehaviour
    {
        public RunSession session;
        public Vector3 travel;
        public float period=4f;
        public Vector3 SurfaceVelocity {get;private set;}
        private Rigidbody body;
        private Vector3 origin;
        private float started;
        private void Awake(){body=GetComponent<Rigidbody>();body.isKinematic=true;body.useGravity=false;origin=transform.position;}
        public void ResetForRun(){body.position=origin;started=Time.time;SurfaceVelocity=Vector3.zero;}
        private void FixedUpdate()
        {
            if(session==null || !session.PlayerVulnerable){SurfaceVelocity=Vector3.zero;return;}
            var next=origin+travel*(.5f-.5f*Mathf.Cos((Time.time-started)/period*2f*Mathf.PI));
            SurfaceVelocity=(next-body.position)/Time.fixedDeltaTime;body.MovePosition(next);
        }
    }
}
