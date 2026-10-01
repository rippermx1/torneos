using UnityEngine;

namespace Orbit.AlienRun
{
    public sealed class BouncePad : MonoBehaviour
    {
        public RunSession session;
        public float upwardSpeed = 12f;
        public Transform visual;
        public float surfaceOffset;
        public float halfWidth=.7f;
        private Vector3 visualScale;
        private float lastBounce = -10f;
        public int BounceCount {get;private set;}
        private void Awake(){if(visual!=null)visualScale=visual.localScale;}
        public void ResetForRun(){lastBounce=-10f;BounceCount=0;if(visual!=null)visual.localScale=visualScale;}

        private void Update()
        {
            if(visual!=null) {
                var age=Time.time-lastBounce;
                var squash=age<.38f ? 1f-.5f*Mathf.Sin(Mathf.PI*age/.38f) : 1f;
                visual.localScale=new Vector3(visualScale.x,visualScale.y*squash,visualScale.z);
            }
            if (session == null || !session.PlayerVulnerable ||
                session.runner == null || session.runner.VerticalSpeed>.3f ||
                Time.time - lastBounce < .35f) return;
            var runner = session.runner.transform.position;
            if(visual==null) {
                if(!session.runner.Grounded || Mathf.Abs(runner.x-transform.position.x)>.7f || runner.y<transform.position.y+.45f || runner.y>transform.position.y+1.6f)return;
            } else {
                var controller=session.runner.GetComponent<CharacterController>();
                var feet=runner.y-controller.height*.5f;
                var surface=transform.position.y+surfaceOffset;
                // Include the capsule's leading edge when stepping onto a low pad.
                if(Mathf.Abs(runner.x-transform.position.x)>halfWidth+controller.radius*.8f || feet<surface-.5f || feet>surface+.22f)return;
            }
            session.runner.Bounce(upwardSpeed);
            session.runner.GetComponentInChildren<VisualSkin>()?.PlaySpringJump();
            BounceCount++;
            lastBounce = Time.time;
        }
    }
}
