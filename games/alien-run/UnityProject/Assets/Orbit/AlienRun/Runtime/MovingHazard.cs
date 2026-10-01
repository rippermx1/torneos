using UnityEngine;
namespace Orbit.AlienRun
{
    public sealed class MovingHazard : MonoBehaviour
    {
        public RunSession session;
        public Vector3 travel = Vector3.up*2f;
        public float period = 3f;
        public float phase;
        private Vector3 origin;
        private float started;
        private Collider[] shapes;
        private Rigidbody body;
        public float VerticalVelocity {get;private set;}
        private void Awake() { origin=transform.position; shapes=GetComponentsInChildren<Collider>();body=GetComponent<Rigidbody>(); }
        public void ResetForRun() { if(body!=null)body.position=origin;else transform.position=origin; started=Time.time; }
        private void FixedUpdate()
        {
            if(session == null || !session.PlayerVulnerable) return;
            var next=origin+travel*(.5f-.5f*Mathf.Cos((Time.time-started)/period*Mathf.PI*2f+phase));
            VerticalVelocity=(next.y-transform.position.y)/Time.fixedDeltaTime;
            if(body!=null)body.MovePosition(next);else transform.position=next;
            var runner=session.runner.GetComponent<CharacterController>();
            foreach(var shape in shapes)
                if(shape.enabled && Physics.ComputePenetration(shape,shape.transform.position,shape.transform.rotation,
                    runner,runner.transform.position,runner.transform.rotation,out _,out _))
                { session.Respawn(); break; }
        }
    }
}
