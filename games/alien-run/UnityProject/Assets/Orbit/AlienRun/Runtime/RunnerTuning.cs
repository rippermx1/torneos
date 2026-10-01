using UnityEngine;
namespace Orbit.AlienRun
{
    [CreateAssetMenu(menuName = "Orbit/Alien Run/Runner tuning")]
    public sealed class RunnerTuning : ScriptableObject
    {
        [Min(0.1f)] public float maxSpeed = 7f;
        [Min(0.1f)] public float acceleration = 38f;
        [Min(0.1f)] public float braking = 45f;
        [Min(0.1f)] public float jumpHeight = 2.8f;
        public float gravity = -28f;
        [Range(0.01f, 0.3f)] public float coyoteTime = 0.10f;
        [Range(0.01f, 0.3f)] public float jumpBuffer = 0.12f;
        [Range(0.1f, 1f)] public float jumpReleaseMultiplier = 0.45f;
    }
}
