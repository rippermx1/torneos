using UnityEngine;
namespace Orbit.AlienRun
{
    public sealed class FollowCamera : MonoBehaviour
    {
        public Transform target;
        public Vector3 offset = new Vector3(0, 5f, -16f);
        public float lookAhead = 2f;
        public float minFocusX = float.NegativeInfinity;
        public float maxFocusX = float.PositiveInfinity;
        public float verticalFollow = 0f;
        public float maxVerticalLift = 0f;
        public float baseFocusY = 1.7f;
        public bool stableFraming;
        private Vector3 focus;
        private bool initialized;
        public void SnapTo(Vector3 position)
        {
            focus=FocusFor(position);initialized=true;
            transform.position=focus+offset;transform.LookAt(focus);
        }
        private Vector3 FocusFor(Vector3 position)
        {
            var x=Mathf.Clamp(position.x+lookAhead,minFocusX,maxFocusX);
            var lift=Mathf.Clamp((position.y-1f)*verticalFollow,0f,maxVerticalLift);
            return new Vector3(x,baseFocusY+lift,0);
        }
        private void LateUpdate()
        {
            if (target == null) return;
            var focusX = Mathf.Clamp(target.position.x + lookAhead, minFocusX, maxFocusX);
            var lift = Mathf.Clamp((target.position.y - 1f) * verticalFollow, 0f, maxVerticalLift);
            var lookAt = new Vector3(focusX, baseFocusY + lift, 0);
            if(stableFraming) {
                if(!initialized)SnapTo(target.position);
                var motor=target.GetComponent<RunnerMotor>();
                if(motor!=null && !motor.Grounded && motor.VerticalSpeed<0 && target.position.y<1f)lookAt.y=Mathf.Max(lookAt.y,focus.y);
                focus=Vector3.Lerp(focus,lookAt,1f-Mathf.Exp(-6f*Time.deltaTime));
                focus.y=Mathf.Max(baseFocusY,focus.y);
                transform.position=focus+offset;transform.LookAt(focus);return;
            }
            transform.position = Vector3.Lerp(transform.position, lookAt + offset, 1f - Mathf.Exp(-8f * Time.deltaTime));
            transform.LookAt(lookAt);
        }
    }
}
