using UnityEngine;
namespace Orbit.AlienRun
{
    // Provenance and measured geometry for the local gameplay copies of the licensed kit.
    public sealed class GameElement : MonoBehaviour
    {
        public string sourceGuid;
        public string family;
        public string role;
        public string physicsPolicy;
        public Vector3 nativeSize;
        public float slopeRise;
        public float facingYaw;
    }
}
