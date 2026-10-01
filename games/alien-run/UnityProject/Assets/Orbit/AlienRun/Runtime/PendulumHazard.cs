using UnityEngine;

namespace Orbit.AlienRun
{
    [RequireComponent(typeof(Rigidbody))]
    public sealed class PendulumHazard : MonoBehaviour
    {
        public RunSession session;
        public Vector3 pivot;
        public float length = 2f;
        public float angle = 40f;
        public float period = 3.8f;
        public Transform suspension;
        private Rigidbody body;
        private float started;
        private void Awake() { body=GetComponent<Rigidbody>(); }
        public void ResetForRun()
        {
            started=Time.time;
            body.position=pivot+Vector3.down*length;
        }
        private void FixedUpdate()
        {
            if(session==null || !session.PlayerVulnerable)return;
            var theta=angle*Mathf.Deg2Rad*Mathf.Sin((Time.time-started)*2*Mathf.PI/period);
            body.MovePosition(pivot+new Vector3(length*Mathf.Sin(theta),-length*Mathf.Cos(theta),0));
        }
        private void LateUpdate()
        {
            if(suspension==null)return;
            suspension.position=(pivot+transform.position)*.5f;
            suspension.rotation=Quaternion.FromToRotation(Vector3.up,pivot-transform.position);
        }
    }
}
