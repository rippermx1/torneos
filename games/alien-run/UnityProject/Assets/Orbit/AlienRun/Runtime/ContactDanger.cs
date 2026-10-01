using UnityEngine;
namespace Orbit.AlienRun
{
    public sealed class ContactDanger : MonoBehaviour
    {
        public RunSession session;
        private Collider shape;
        private void Awake()=>shape=GetComponent<Collider>();
        private void Update()
        {
            if(session==null || !session.PlayerVulnerable || shape==null || !shape.enabled)return;
            var runner=session.runner.GetComponent<CharacterController>();
            if(Physics.ComputePenetration(shape,shape.transform.position,shape.transform.rotation,runner,
                runner.transform.position,runner.transform.rotation,out _,out _)){
#if UNITY_EDITOR || DEVELOPMENT_BUILD
                Debug.Log(name+" contact hit at "+runner.transform.position+" bounds "+shape.bounds);
#endif
                session.Respawn();
            }
        }
    }
}
