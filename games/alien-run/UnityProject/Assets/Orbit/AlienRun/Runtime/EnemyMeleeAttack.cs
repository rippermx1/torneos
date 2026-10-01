using UnityEngine;
namespace Orbit.AlienRun
{
    /// <summary>A committed, telegraphed strike: jump or move behind the attacker to dodge.</summary>
    [RequireComponent(typeof(PatrolEnemy))]
    public sealed class EnemyMeleeAttack : MonoBehaviour
    {
        public RunSession session;
        [Min(.1f)]public float detectionRange=2.6f,reach=1.8f,windup=.45f,cooldown=1.7f;
        [Min(.01f)]public float activeSeconds=.16f;
        [Min(0)]public float recovery=.5f;
        public bool WindingUp {get;private set;}
        public bool Striking {get;private set;}
        public bool Busy=>WindingUp || Striking || Time.time<recoveryUntil;
        public int Swings {get;private set;}
        private PatrolEnemy enemy;
        private CharacterController runnerShape;
        private float nextAttack,releaseAt,activeUntil,recoveryUntil;
        private int direction;
        private bool hitThisSwing;
        private readonly Collider[] strikeHits=new Collider[16];
        private void Awake()=>enemy=GetComponent<PatrolEnemy>();
        private void OnEnable()=>nextAttack=Time.time+.55f;
        public void ResetForRun(){Swings=0;nextAttack=Time.time+.55f;CancelAttack();}
        public void CancelAttack(){WindingUp=Striking=false;recoveryUntil=0;enemy?.ShowAttackCue(false);}
        private void OnDisable()=>CancelAttack();
        private void Update()
        {
            if(session==null || session.runner==null || !session.PlayerVulnerable || enemy==null || !enemy.Alive)
            {CancelAttack();nextAttack=Time.time+.55f;return;}
            if(runnerShape==null)runnerShape=session.runner.GetComponent<CharacterController>();
            if(WindingUp)
            {
                if(Time.time<releaseAt)return;
                WindingUp=false;Striking=true;activeUntil=Time.time+activeSeconds;recoveryUntil=activeUntil+recovery;hitThisSwing=false;Swings++;
                enemy.PlayAction("Attack");enemy.ShowAttackCue(true,true,reach);
            }
            if(Striking)
            {
                if(Time.time>=activeUntil){Striking=false;nextAttack=Time.time+cooldown;enemy.ShowAttackCue(false);}
                else if(!hitThisSwing && WithinStrike()){hitThisSwing=true;session.Respawn();}
                return;
            }
            if(Busy || Time.time<nextAttack)return;
            var delta=session.runner.transform.position-transform.position;
            if(Mathf.Abs(delta.x)>detectionRange || Mathf.Abs(delta.y)>1.1f || Mathf.Abs(delta.z)>.8f)return;
            direction=delta.x>=0?1:-1;enemy.Face(direction);enemy.PlayAction("Idle");WindingUp=true;releaseAt=Time.time+windup;enemy.ShowAttackCue(true);
        }
        private bool WithinStrike()
        {
            if(runnerShape==null || !runnerShape.enabled)return false;
            var center=transform.position+new Vector3(direction*(reach+.4f)*.5f,0,0);
            var extent=new Vector3(Mathf.Max(.05f,reach-.4f),1.35f,.85f)*.5f;
            var count=Physics.OverlapBoxNonAlloc(center,extent,strikeHits,Quaternion.identity,~0,QueryTriggerInteraction.Collide);
            var touchesRunner=false;
            for(var i=0;i<count;i++)if(strikeHits[i]==runnerShape){touchesRunner=true;break;}
            if(!touchesRunner)return false;
            var origin=transform.position+Vector3.up*.15f;var aim=session.runner.transform.position-origin;
            return !Physics.Raycast(origin,aim.normalized,out var obstruction,aim.magnitude,~0,QueryTriggerInteraction.Ignore) ||
                obstruction.collider.GetComponentInParent<RunnerMotor>()==session.runner;
        }
    }
}
