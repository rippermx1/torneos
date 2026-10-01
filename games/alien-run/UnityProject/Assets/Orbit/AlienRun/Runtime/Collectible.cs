using UnityEngine;
namespace Orbit.AlienRun
{
    public sealed class Collectible : MonoBehaviour
    {
        public string collectibleId;
        public bool isStar;
        public Transform visual;
        private void Update() { (visual != null ? visual : transform).Rotate(0, 110f * Time.deltaTime, 0, Space.World); }

        public void Collect(RunSession owner)
        {
            if (!gameObject.activeSelf) return;
            PickupFeedback.Play(this, owner);
            // Collection remains immediate; the separate visual owns its short exit animation.
            gameObject.SetActive(false);
        }
    }
}
