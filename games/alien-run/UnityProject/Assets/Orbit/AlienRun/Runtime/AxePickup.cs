using UnityEngine;
namespace Orbit.AlienRun
{
    public sealed class AxePickup : MonoBehaviour
    {
        public RunSession session;
        public int amount = 8;
        private Vector3 origin;
        private float born;
        private void Start() { origin=transform.position; born=Time.time; }
        private void Update()
        {
            if (session == null || session.State != RunState.Playing) return;
            transform.position=origin+Vector3.up*(Mathf.Sin((Time.time-born)*3f)*.12f);
            transform.Rotate(0f,110f*Time.deltaTime,0f,Space.World);
            if (Vector3.Distance(transform.position,session.runner.transform.position)>1.45f) return;
            session.runner.GetComponent<AxeWeapon>()?.Grant(amount);
            session.ShowHint("Hachas listas: X o HACHA. Rompe cajas y alcanza enemigos.");
            Destroy(gameObject);
        }
    }
}
