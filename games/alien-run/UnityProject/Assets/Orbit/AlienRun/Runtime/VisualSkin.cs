using UnityEngine;
namespace Orbit.AlienRun
{
    /// <summary>Optional presentation adapter. Gameplay collider remains on the parent.</summary>
    public sealed class VisualSkin : MonoBehaviour
    {
        public GameObject visualPrefab;
        public GameObject fallbackVisual;
        public Material materialOverride;
        public RuntimeAnimatorController animationController;
        public Vector3 visualOffset;
        public Vector3 visualEuler;
        public Vector3 visualScale = Vector3.one;
        public string CurrentAnimationState { get; private set; }
        private Animator animator;
        private RunnerMotor motor;
        private RunSession session;
        private bool wasGrounded;
        private float landingUntil;
        private float throwUntil;
        private float springUntil;
        public void PlayThrow() => throwUntil = Time.time + .4f;
        public void PlaySpringJump() => springUntil = Time.time + .18f;
        private void Awake()
        {
            if (visualPrefab == null) return;
            motor = GetComponentInParent<RunnerMotor>();
            session = motor != null ? motor.session : null;
            var instance = Instantiate(visualPrefab, transform);
            instance.transform.localPosition = visualOffset;
            instance.transform.localRotation = Quaternion.Euler(visualEuler);
            instance.transform.localScale = visualScale;
            if (materialOverride != null)
            {
                foreach (var renderer in instance.GetComponentsInChildren<Renderer>(true))
                {
                    var materials = renderer.sharedMaterials;
                    for (var i = 0; i < materials.Length; i++) materials[i] = materialOverride;
                    renderer.sharedMaterials = materials;
                }
            }
            if (animationController != null)
            {
                animator = instance.GetComponentInChildren<Animator>(true);
                if (animator != null)
                {
                    animator.runtimeAnimatorController = animationController;
                    animator.applyRootMotion = false;
                    animator.Play("Idle", 0, 0f);
                    CurrentAnimationState = "Idle";
                }
            }
            foreach (var collider in instance.GetComponentsInChildren<Collider>(true)) collider.enabled = false;
            foreach (var body in instance.GetComponentsInChildren<Rigidbody>(true)) body.isKinematic = true;
            if (fallbackVisual != null) fallbackVisual.SetActive(false);
        }
        private void LateUpdate()
        {
            if (animator == null || motor == null) return;
            var grounded = motor.Grounded;
            if (grounded && !wasGrounded) landingUntil = Time.time + 0.16f;
            wasGrounded = grounded;
            var next = "Idle";
            if (session != null && session.State == RunState.Finished) next = "Finish";
            else if (motor.Playing)
            {
                if (Time.time < throwUntil && animator.HasState(0, Animator.StringToHash("Throw"))) next = "Throw";
                else if(Time.time<springUntil)next="Jump";
                else if(motor.ScriptedMovement && animator.HasState(0,Animator.StringToHash("Walk")))next="Walk";
                else if (!grounded && motor.VerticalSpeed > 0.35f) next = "Jump";
                else if (!grounded) next = "Fall";
                else if (Time.time < landingUntil) next = "Land";
                else if (motor.HorizontalSpeed > 0.2f) next = "Run";
            }
            animator.speed = next == "Run" ? Mathf.Clamp(motor.HorizontalSpeed / 4f, 0.8f, 2f) : 1f;
            if (next == CurrentAnimationState) return;
            animator.CrossFadeInFixedTime(next, 0.08f);
            CurrentAnimationState = next;
        }
    }
}
