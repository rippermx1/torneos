using UnityEngine;
namespace Orbit.AlienRun
{
    [RequireComponent(typeof(BoxCollider))]
    public sealed class BreakableBlock : MonoBehaviour
    {
        public bool grantsAxes = true;
        public bool IsBroken { get; private set; }
        public void ResetForRun()
        {
            IsBroken=false;
            GetComponent<BoxCollider>().enabled=true;
            foreach(var r in GetComponentsInChildren<Renderer>(true)) r.enabled=r.gameObject!=gameObject;
        }
        public void Break(RunSession session)
        {
            if (IsBroken || session == null || session.State != RunState.Playing) return;
            IsBroken=true;
            GetComponent<BoxCollider>().enabled=false;
            foreach(var r in GetComponentsInChildren<Renderer>(true)) r.enabled=false;
            var weapon=session.runner.GetComponent<AxeWeapon>();
            if(grantsAxes && weapon != null && weapon.axePrefab != null)
            {
                var pickup=new GameObject("AxeReward");
                // Reward appears below an overhead block, within the player's reach.
                pickup.transform.position=transform.position+Vector3.down*1.2f;
                var visual=Instantiate(weapon.axePrefab,pickup.transform); visual.SetActive(true);
                pickup.AddComponent<AxePickup>().session=session;
                session.ShowHint("Caja abierta. Recoge el hacha.");
            }
            var material=GetComponentInChildren<Renderer>(true)?.sharedMaterial;
            for(var i=0;i<5;i++)
            {
                var shard=GameObject.CreatePrimitive(PrimitiveType.Cube);
                shard.name="CrateFragment"; shard.transform.position=transform.position;
                shard.transform.localScale=Vector3.one*.2f;
                Destroy(shard.GetComponent<Collider>());
                if(material != null) shard.GetComponent<Renderer>().sharedMaterial=material;
                shard.AddComponent<BlockFragment>().velocity=new Vector3((i-2)*1.8f,3f+(i%2),-.2f);
            }
        }
    }
    public sealed class BlockFragment : MonoBehaviour
    {
        public Vector3 velocity;
        private float age;
        private void Update()
        {
            age+=Time.deltaTime;velocity+=Vector3.down*18f*Time.deltaTime;
            transform.position+=velocity*Time.deltaTime;transform.Rotate(90f*Time.deltaTime,120f*Time.deltaTime,0f);
            if(age>1f) Destroy(gameObject);
        }
    }
}
