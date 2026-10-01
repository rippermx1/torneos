using UnityEngine;
namespace Orbit.AlienRun
{
    [RequireComponent(typeof(PatrolEnemy))]
    public sealed class EnemyAxeThrower : MonoBehaviour
    {
        public RunSession session;
        public GameObject axePrefab;
        [Min(.1f)]public float range=9f, cooldown=2.25f, windup=.65f,projectileSpeed=8f;
        [Min(0)]public float recovery=.32f;
        public bool WindingUp {get;private set;}
        public bool Busy=>WindingUp || Time.time<recoveryUntil;
        public int Throws {get;private set;}
        private float nextThrow,releaseAt,recoveryUntil;
        private PatrolEnemy enemy;
        private int direction;
        private Vector3 targetAtWindup;
        public void CancelThrow(){WindingUp=false;recoveryUntil=0;enemy?.ShowAttackCue(false);}
        private void Awake()=>enemy=GetComponent<PatrolEnemy>();
        public void ResetForRun(){nextThrow=Time.time+.8f;Throws=0;CancelThrow();}
        private void OnEnable()=>nextThrow=Time.time+.8f;
        private void OnDisable()=>CancelThrow();
        private void Update()
        {
            if(session==null || session.runner==null || !session.PlayerVulnerable || enemy==null || !enemy.Alive)
            {CancelThrow();nextThrow=Time.time+.55f;return;}
            if(WindingUp) {
                if(Time.time>=releaseAt){Throw();WindingUp=false;recoveryUntil=Time.time+recovery;nextThrow=Time.time+cooldown;enemy.ShowAttackCue(false);}
                return;
            }
            if(Busy || axePrefab==null || Time.time<nextThrow)return;
            var target=session.runner.transform.position;var delta=target-transform.position;
            if(Mathf.Abs(delta.x)>range || Mathf.Abs(delta.y)>4.5f || Mathf.Abs(delta.z)>1f)return;
            var origin=transform.position+Vector3.up*.5f;var aim=target-origin;
            if(Physics.Raycast(origin,aim.normalized,out var obstruction,aim.magnitude,~0,QueryTriggerInteraction.Ignore) &&
                obstruction.collider.GetComponentInParent<RunnerMotor>()!=session.runner)return;
            targetAtWindup=target;
            direction=delta.x>=0?1:-1;
            enemy.Face(direction);
            WindingUp=true;releaseAt=Time.time+windup;
            enemy.PlayAction("Throw");enemy.ShowAttackCue(true);
        }
        private void Throw()
        {
            if(axePrefab==null || !enemy.Alive || !session.PlayerVulnerable)return;
            var g=new GameObject("Enemy_Thrown_Axe");g.transform.position=transform.position+new Vector3(direction*.8f,.5f,0);
            var visual=Instantiate(axePrefab,g.transform);
            foreach(var shape in visual.GetComponentsInChildren<Collider>())shape.enabled=false;
            var axe=g.AddComponent<AxeProjectile>();axe.session=session;axe.visual=visual.transform;axe.hostile=true;
            var distance=Mathf.Abs(targetAtWindup.x-g.transform.position.x);
            var flight=Mathf.Clamp(distance/projectileSpeed,.45f,1.25f);
            var rise=targetAtWindup.y-g.transform.position.y;
            axe.velocity=new Vector3(direction*projectileSpeed,Mathf.Clamp((rise+9.8f*flight*flight)/flight,3f,11f),0);
            Throws++;
        }
    }
}
