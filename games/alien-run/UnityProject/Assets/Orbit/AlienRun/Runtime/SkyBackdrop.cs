using UnityEngine;

namespace Orbit.AlienRun
{
    /// <summary>Keeps one authored sky panel behind the camera without repeated texture seams.</summary>
    [DefaultExecutionOrder(100)]
    public sealed class SkyBackdrop : MonoBehaviour
    {
        [Range(0f, .4f)] public float parallax = .12f;
        public const float MaximumParallaxOffset = 8f;

        private Camera viewCamera;
        private bool initialized;
        private float anchorCameraX, skyY, skyZ;

        private void Awake() => Refresh();
        private void LateUpdate() => Refresh();

        /// <summary>Also call after positioning the camera for an Editor capture.</summary>
        public void Refresh()
        {
            if (viewCamera == null || !viewCamera.isActiveAndEnabled)
                viewCamera = Camera.main;
            if (viewCamera == null) return;

            if (!initialized)
            {
                var position = transform.position;
                skyY = position.y;
                skyZ = position.z;
                anchorCameraX = viewCamera.transform.position.x;
                initialized = true;
            }

            var cameraX = viewCamera.transform.position.x;
            var lag = Mathf.Clamp((cameraX - anchorCameraX) * Mathf.Clamp(parallax, 0f, .4f),
                -MaximumParallaxOffset, MaximumParallaxOffset);
            transform.position = new Vector3(cameraX - lag, skyY, skyZ);
        }
    }
}
