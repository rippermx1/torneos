using System.Collections;
using UnityEngine;

namespace Orbit.AlienRun
{
    public sealed class PatrolEnemy : MonoBehaviour
    {
        public RunSession session;
        public float leftX = 35f;
        public float rightX = 39f;
        [Min(0)] public float speed = 2.8f;
        public float hitRadius = .85f;
        public Color warningColor=new Color(1f,.69f,.18f,1f);
        public Color attackColor=new Color(.94f,.25f,.10f,1f);
        private float patrolX;
        private int patrolDirection=1;
        private Animator animator;
        private EnemyAxeThrower thrower;
        private EnemyMeleeAttack melee;
        private Collider[] shapes;
        private bool[] initialColliderEnabled;
        private Rigidbody body;
        private CharacterController runnerShape;
        private LineRenderer attackCue;
        private Material cueMaterial;
        public bool Alive {get;private set;}=true;
        public string DeathAnimation {get;private set;}
        public string ActionAnimation {get;private set;}
        public int Facing {get;private set;}=1;
        private void Awake()
        {
            animator=GetComponentInChildren<Animator>();thrower=GetComponent<EnemyAxeThrower>();melee=GetComponent<EnemyMeleeAttack>();
            body=GetComponent<Rigidbody>();shapes=GetComponentsInChildren<Collider>(true);initialColliderEnabled=new bool[shapes.Length];
            for(var i=0;i<shapes.Length;i++)initialColliderEnabled[i]=shapes[i].enabled;
            patrolX=transform.position.x;if(animator!=null)animator.applyRootMotion=false;
        }
        public void Face(int direction)
        {
            Facing=direction>=0?1:-1;
            if(animator!=null)animator.transform.rotation=Quaternion.Euler(0,Facing>0?90:270,0);
        }
        public void PlayAction(string state)
        {
            ActionAnimation=state;
            if(animator!=null && animator.HasState(0,Animator.StringToHash(state)))
            {animator.speed=1;animator.CrossFadeInFixedTime(state,.06f);}
        }
        // Colliderless anticipation marker and slash use the level's warm danger accents.
        public void ShowAttackCue(bool visible,bool active=false,float reach=0)
        {
            if(!visible){if(attackCue!=null)attackCue.enabled=false;return;}
            if(attackCue==null)
            {
                var shader=Shader.Find("Universal Render Pipeline/Unlit")??Shader.Find("Sprites/Default");if(shader==null)return;
                cueMaterial=new Material(shader);var cue=new GameObject("Attack_Warning");cue.transform.SetParent(transform,false);
                attackCue=cue.AddComponent<LineRenderer>();attackCue.sharedMaterial=cueMaterial;attackCue.useWorldSpace=false;
                attackCue.positionCount=3;attackCue.numCapVertices=3;
                attackCue.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;attackCue.receiveShadows=false;
            }
            attackCue.enabled=true;var color=active?attackColor:warningColor;
            if(cueMaterial.HasProperty("_BaseColor"))cueMaterial.SetColor("_BaseColor",color);else cueMaterial.color=color;
            attackCue.startColor=attackCue.endColor=color;attackCue.startWidth=active?.10f:.08f;attackCue.endWidth=active?.03f:.08f;
            if(active && reach>0)
            {
                attackCue.SetPosition(0,new Vector3(Facing*.45f,.5f,-.42f));attackCue.SetPosition(1,new Vector3(Facing*reach,.05f,-.42f));
                attackCue.SetPosition(2,new Vector3(Facing*.6f,-.4f,-.42f));
            }
            else
            {
                var top=1.12f;foreach(var shape in shapes)if(shape!=null && shape.enabled)top=Mathf.Max(top,shape.bounds.max.y-transform.position.y+.18f);
                attackCue.SetPosition(0,new Vector3(-.17f,top+.38f,-.42f));attackCue.SetPosition(1,new Vector3(0,top,-.42f));
                attackCue.SetPosition(2,new Vector3(.17f,top+.38f,-.42f));
            }
        }
        public void Defeat()
        {
            if(!Alive)return;Alive=false;foreach(var c in shapes)if(c!=null)c.enabled=false;
            thrower?.CancelThrow();melee?.CancelAttack();ShowAttackCue(false);DeathAnimation="Death";PlayAction("Death");
            StartCoroutine(FallAndRemove());
        }
        private IEnumerator FallAndRemove()
        {
            yield return new WaitForSeconds(1f);
            if(animator!=null && animator.HasState(0,Animator.StringToHash("DeathPose")))animator.Play("DeathPose");
            yield return new WaitForSeconds(.35f);gameObject.SetActive(false);
        }
        public void ResetForRun()
        {
            StopAllCoroutines();Alive=true;DeathAnimation=null;gameObject.SetActive(true);
            patrolX=Mathf.Min(leftX,rightX);patrolDirection=1;
            var position=new Vector3(patrolX,transform.position.y,0);transform.position=position;
            if(body!=null && body.isKinematic)body.position=position;
            for(var i=0;i<shapes.Length;i++)if(shapes[i]!=null)shapes[i].enabled=initialColliderEnabled[i];
            thrower=GetComponent<EnemyAxeThrower>();melee=GetComponent<EnemyMeleeAttack>();thrower?.ResetForRun();melee?.ResetForRun();
            Face(1);ShowAttackCue(false);PlayAction("Idle");
        }
        private void FixedUpdate()
        {
            if(!Alive || session==null || session.runner==null || !session.PlayerVulnerable)return;
            if(thrower==null)thrower=GetComponent<EnemyAxeThrower>();if(melee==null)melee=GetComponent<EnemyMeleeAttack>();
            if((thrower!=null && thrower.Busy)||(melee!=null && melee.Busy))return;
            var low=Mathf.Min(leftX,rightX);var high=Mathf.Max(leftX,rightX);patrolX=Mathf.Clamp(patrolX,low,high);
            if(high>low && speed>0)
            {
                var next=patrolX+patrolDirection*speed*Time.fixedDeltaTime;
                // Reflect overshoot instead of discarding distance at the endpoint.
                while(next<low || next>high)
                {if(next>high){next=2*high-next;patrolDirection=-1;}else{next=2*low-next;patrolDirection=1;}}
                patrolX=next;Face(patrolDirection);if(ActionAnimation!="Run")PlayAction("Run");
                if(animator!=null)animator.speed=Mathf.Clamp(speed/3f,.85f,1.4f);
                var position=new Vector3(patrolX,transform.position.y,0);
                if(body!=null && body.isKinematic)body.MovePosition(position);else transform.position=position;
            }
            else if(ActionAnimation!="Idle")PlayAction("Idle");
        }
        private void Update()
        {
            if(!Alive || session==null || session.runner==null || !session.PlayerVulnerable)return;
            if(runnerShape==null)runnerShape=session.runner.GetComponent<CharacterController>();if(runnerShape==null || !runnerShape.enabled)return;
            var p=session.runner.transform.position;var feet=runnerShape.bounds.min.y;var hasShape=false;
            foreach(var shape in shapes)
            {
                if(shape==null || !shape.enabled || !shape.gameObject.activeInHierarchy)continue;
                hasShape=true;var bounds=shape.bounds;
                var width=bounds.extents.x+runnerShape.radius*Mathf.Abs(session.runner.transform.lossyScale.x)-.06f;
                if(session.runner.VerticalSpeed<-.5f && Mathf.Abs(p.x-bounds.center.x)<=width &&
                    Mathf.Abs(p.z-bounds.center.z)<=bounds.extents.z+runnerShape.radius &&
                    feet>=bounds.max.y-.22f && feet<=bounds.max.y+.35f)
                {Defeat();session.runner.Bounce(8.5f);session.runner.GetComponentInChildren<VisualSkin>()?.PlaySpringJump();return;}
            }
            foreach(var shape in shapes)
                if(shape!=null && shape.enabled && shape.gameObject.activeInHierarchy &&
                    Physics.ComputePenetration(shape,shape.transform.position,shape.transform.rotation,runnerShape,
                        runnerShape.transform.position,runnerShape.transform.rotation,out _,out _))
                {session.Respawn();return;}
            // Colliderless legacy drones retain their radial body; own ground actors use actual shapes.
            if(!hasShape && (p-transform.position).sqrMagnitude<=hitRadius*hitRadius)session.Respawn();
        }
        private void OnDisable()=>ShowAttackCue(false);
        private void OnDestroy(){if(cueMaterial!=null)Destroy(cueMaterial);}
    }
}
