using UnityEngine;

namespace Orbit.AlienRun
{
    public sealed class VisualSpinner : MonoBehaviour
    {
        public float degreesPerSecond = 240f;

        private void Update() => transform.Rotate(0f, 0f, degreesPerSecond * Time.deltaTime, Space.World);
    }
}
