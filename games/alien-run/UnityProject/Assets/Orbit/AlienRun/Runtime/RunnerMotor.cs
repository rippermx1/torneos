using UnityEngine;
using UnityEngine.InputSystem;
namespace Orbit.AlienRun
{
    [RequireComponent(typeof(CharacterController))]
    public sealed class RunnerMotor : MonoBehaviour
    {
        public RunnerTuning tuning;
        public Transform visualRoot;
        public RunSession session;
        public bool Playing { get; set; }
        public bool ScriptedMovement { get; set; }
        public float ScriptedAxis { get; set; }
        public float ScriptedSpeed { get; set; } = 3.8f;
        public float TouchAxis { get; set; }
        private bool touchJumpQueued;
        private bool touchJumpHeld;
        private bool touchJumpReleased;
        private CharacterController controller;
        private Vector3 velocity;
        private float coyoteUntil = -1f;
        private float jumpUntil = -1f;
        private bool jumped;
        public float HorizontalSpeed => Mathf.Abs(velocity.x);
        public float VerticalSpeed => velocity.y;
        public bool Grounded => controller != null && controller.isGrounded;
        public bool TouchJumpHeld => touchJumpHeld;
        public int Facing { get; private set; } = 1;
        private void Awake() { controller = GetComponent<CharacterController>(); }
        public void QueueTouchJump() { touchJumpQueued = true; }
        public void PressTouchJump() { touchJumpHeld = true; touchJumpQueued = true; }
        public void ReleaseTouchJump() { touchJumpHeld = false; touchJumpReleased = true; }
        public void Bounce(float upwardSpeed)
        {
            if (!Playing) return;
            velocity.y = Mathf.Max(velocity.y, upwardSpeed);
            jumpUntil = coyoteUntil = -1f;
            jumped = true;
        }
        public Vector3 GroundPosition(Vector3 point)
        {
            if(!controller)controller=GetComponent<CharacterController>();
            var hits=Physics.RaycastAll(point,Vector3.down,12f,~0,QueryTriggerInteraction.Ignore);
            System.Array.Sort(hits,(a,b)=>a.distance.CompareTo(b.distance));
            foreach(var hit in hits) {
                if(hit.collider.GetComponentInParent<RunnerMotor>()!=null || hit.collider.GetComponentInParent<BreakableBlock>()!=null)continue;
                return new Vector3(point.x,hit.point.y+controller.height*.5f-controller.center.y+controller.skinWidth,0);
            }
            return point;
        }
        public void ResetAt(Vector3 position)
        {
            if (!controller) controller = GetComponent<CharacterController>();
            controller.enabled = false;
            transform.position = position;
            controller.enabled = true;
            velocity = Vector3.zero; coyoteUntil = jumpUntil = -1f; jumped = false;
            TouchAxis = 0; touchJumpQueued = false; touchJumpHeld = false; touchJumpReleased = false;
        }
        private void Update()
        {
            if (!Playing || tuning == null) return;
            var keyboard = Keyboard.current;
            float axis = ScriptedMovement ? ScriptedAxis : TouchAxis;
            if (keyboard != null && !ScriptedMovement)
            {
                if (keyboard.aKey.isPressed || keyboard.leftArrowKey.isPressed) axis -= 1;
                if (keyboard.dKey.isPressed || keyboard.rightArrowKey.isPressed) axis += 1;
                if (keyboard.escapeKey.wasPressedThisFrame) { session.AbortRun(); return; }
            }
            axis = Mathf.Clamp(axis, -1f, 1f);
            if (Mathf.Abs(axis) > .01f) Facing = axis > 0 ? 1 : -1;
            bool jumpDown = !ScriptedMovement && (touchJumpQueued || (keyboard != null && keyboard.spaceKey.wasPressedThisFrame));
            bool jumpReleased = !ScriptedMovement && (touchJumpReleased || (keyboard != null && keyboard.spaceKey.wasReleasedThisFrame));
            touchJumpQueued = false; touchJumpReleased = false;
            if (jumpDown) jumpUntil = Time.time + tuning.jumpBuffer;
            if (jumpReleased && velocity.y > 0) velocity.y *= tuning.jumpReleaseMultiplier;
            // Bound integration steps so a slow mobile frame does not shorten the jump envelope.
            var steps=Mathf.Max(1,Mathf.CeilToInt(Time.deltaTime/(1f/60f)));
            var dt=Time.deltaTime/steps;
            for(var i=0;i<steps;i++)
            {
                var carry=Vector3.zero;
                if(controller.isGrounded && velocity.y<=0)
                {
                    coyoteUntil=Time.time+tuning.coyoteTime;velocity.y=-2; jumped=false;
                    var foot=transform.position+Vector3.up*(controller.center.y-controller.height*.5f+.18f);
                    if(Physics.Raycast(foot,Vector3.down,out var support,.5f,~0,QueryTriggerInteraction.Ignore))
                        carry=support.collider.GetComponentInParent<MovingPlatform>()?.SurfaceVelocity??Vector3.zero;
                }
                if(Time.time<=jumpUntil && Time.time<=coyoteUntil && !jumped)
                {
                    velocity.y=Mathf.Sqrt(2f*Mathf.Abs(tuning.gravity)*tuning.jumpHeight);
                    jumpUntil=coyoteUntil=-1; jumped=true;
                }
                velocity.x=Mathf.MoveTowards(velocity.x,axis*(ScriptedMovement?ScriptedSpeed:tuning.maxSpeed),
                    (Mathf.Abs(axis)>.01f?tuning.acceleration:tuning.braking)*dt);
                velocity.y+=tuning.gravity*dt;
                var flags=controller.Move(new Vector3((velocity.x+carry.x)*dt,(velocity.y+carry.y)*dt,-transform.position.z));
                if((flags&CollisionFlags.Above)!=0 && velocity.y>0)velocity.y=0;
            }
            if (visualRoot != null && Mathf.Abs(axis) > 0.01f)
                visualRoot.localRotation = Quaternion.Euler(0, axis > 0 ? 90 : -90, 0);
        }
        private void OnControllerColliderHit(ControllerColliderHit hit)
        {
            if (Playing && velocity.y > 0f && hit.normal.y < -.5f)
            {
                var block = hit.collider.GetComponent<BreakableBlock>();
                if (block != null) { block.Break(session); velocity.y = -2f; return; }
            }
            if (Playing && hit.collider.GetComponent<Hazard>() != null) session.Respawn();
        }
    }
}
