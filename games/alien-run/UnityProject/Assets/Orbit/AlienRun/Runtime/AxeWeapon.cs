using UnityEngine;
using UnityEngine.InputSystem;

namespace Orbit.AlienRun
{
    [RequireComponent(typeof(RunnerMotor))]
    public sealed class AxeWeapon : MonoBehaviour
    {
        public GameObject axePrefab;
        public int Ammo { get; private set; }
        public float LastThrowAt { get; private set; } = -100f;
        private RunnerMotor motor;
        private void Awake() => motor = GetComponent<RunnerMotor>();
        public void ResetForRun() { Ammo = 0; LastThrowAt = -100f; }
        public void Grant(int count) => Ammo = Mathf.Min(24, Ammo + count);
        private void Update()
        {
            if (Keyboard.current != null && Keyboard.current.xKey.wasPressedThisFrame) TryThrow();
        }
        public bool TryThrow()
        {
            if (motor == null) motor = GetComponent<RunnerMotor>();
            if (!motor.Playing || motor.ScriptedMovement || Ammo <= 0 || axePrefab == null || Time.time - LastThrowAt < .45f) return false;
            Ammo--; LastThrowAt = Time.time;
            var root = new GameObject("ThrownAxe");
            root.transform.position = transform.position + new Vector3(motor.Facing * .8f, .35f, 0f);
            var visual = Instantiate(axePrefab, root.transform);
            visual.SetActive(true);
            var projectile = root.AddComponent<AxeProjectile>();
            projectile.session = motor.session;
            projectile.velocity = new Vector3(motor.Facing * 11f, 7f, 0f);
            projectile.visual = visual.transform;
            GetComponentInChildren<VisualSkin>()?.PlayThrow();
            return true;
        }
    }
}
