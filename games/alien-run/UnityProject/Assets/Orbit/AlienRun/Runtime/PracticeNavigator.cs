using UnityEngine;
namespace Orbit.AlienRun
{
    // Development helper: presses normal actions, never moves the transform or grants items.
    public sealed class PracticeNavigator : MonoBehaviour
    {
        public RunSession session;
        public float[] jumps={6.8f,24.4f,33.6f,67.3f,112.3f,116.8f,129.6f,134.3f,149.6f,177.1f,223.5f,228.7f};
        public MovingHazard crusher;
        public MovingPlatform ferry;
        public bool seekStars;
        private bool ferryBoarded;
        private int lastDeaths=-1;
        private int starTarget;
        private bool prepareCanopy;
        private bool landingBeforeGap;
        private float dodgeUntil,dodgeAxis;
        private Collectible Star(int index){foreach(var c in session.collectibles)if(c.collectibleId=="s0"+index)return c;return null;}
        private bool GuardedTrap(float start,float end,float stance,string guardName)
        {
            var r=session.runner;var weapon=r.GetComponent<AxeWeapon>();var x=r.transform.position.x;
            if(x<start || x>end || weapon.Ammo==0)return false;
            foreach(var guard in FindObjectsByType<PatrolEnemy>(FindObjectsInactive.Include,FindObjectsSortMode.None))
                if(guard.name==guardName){
                    var incoming=false;
                    foreach(var axe in FindObjectsByType<AxeProjectile>(FindObjectsSortMode.None))
                        if(axe.hostile && axe.velocity.x<0 && Mathf.Abs(axe.transform.position.x-stance)<15)incoming=true;
                    if(!guard.Alive && !incoming)return false;
                    var dx=stance-x;r.TouchAxis=Mathf.Abs(dx)>.15f?Mathf.Clamp(dx*2,-1,1):r.Facing<0?.02f:0;
                    var distance=guard.transform.position.x-x;
                    if(guard.Alive && Mathf.Abs(dx)<.2f && r.Grounded && r.Facing>0 && distance>7.5f && distance<9.8f)weapon.TryThrow();
                    return true;
                }
            return false;
        }
        public void Drive()
        {
            DriveRoute();
            var r=session.runner;
            foreach(var axe in FindObjectsByType<AxeProjectile>(FindObjectsSortMode.None))
            {
                if(!axe.hostile)continue;
                var relative=axe.velocity.x-r.Facing*r.HorizontalSpeed;
                if(Mathf.Abs(relative)<.01f)continue;
                var contact=(r.transform.position.x-axe.transform.position.x)/relative;
                if(contact<=0 || contact>.55f)continue;
                var axeY=axe.transform.position.y+axe.velocity.y*contact-9.8f*contact*contact;
                var playerY=r.transform.position.y+(r.Grounded?0:r.VerticalSpeed*contact+session.runner.tuning.gravity*.5f*contact*contact);
                if(Mathf.Abs(axeY-playerY)>1.1f)continue;
                if(r.Grounded)r.QueueTouchJump();
                var away=Mathf.Sign(r.transform.position.x-axe.transform.position.x);
                if(Physics.Raycast(r.transform.position+new Vector3(away,1,0),Vector3.down,out var support,12,~0,QueryTriggerInteraction.Ignore) &&
                    support.collider.GetComponentInParent<MovingHazard>()==null && support.collider.GetComponentInParent<MovingPlatform>()==null)
                {dodgeUntil=Time.time+.35f;dodgeAxis=away;}
            }
            if(Time.time<dodgeUntil)r.TouchAxis=dodgeAxis;
        }
        private void DriveRoute()
        {
            var r=session.runner;var x=r.transform.position.x;
            var weapon=r.GetComponent<AxeWeapon>();
            if(lastDeaths!=session.Deaths){lastDeaths=session.Deaths;ferryBoarded=false;starTarget=0;prepareCanopy=false;landingBeforeGap=false;dodgeUntil=0;}
            r.TouchAxis=1;
            if(landingBeforeGap){if(r.Grounded)landingBeforeGap=false;else {r.TouchAxis=0;return;}}
            if(seekStars)
            {
                if(starTarget>0){
                    var star=Star(starTarget);var target=starTarget==4 && !star.gameObject.activeSelf?ferry.transform.position.x:star.transform.position.x;
                    var dx=target-x;r.TouchAxis=Mathf.Abs(dx)>.35f?Mathf.Clamp(dx*2,-1,1):0;
                    if(!star.gameObject.activeSelf && r.Grounded)starTarget=0;else return;
                }
                if(prepareCanopy){r.TouchAxis=Mathf.Clamp((133.5f-x)*2,-1,1);if(r.Grounded && x>132.4f)prepareCanopy=false;else return;}
                if(Star(1).gameObject.activeSelf && x>20.5f && x<22.6f && r.Grounded)starTarget=1;
                else if(Star(2).gameObject.activeSelf && x>56.2f && x<60.5f && r.Grounded && r.transform.position.y>3)starTarget=2;
                else if(Star(3).gameObject.activeSelf && x>129.6f && x<132 && r.Grounded){prepareCanopy=true;r.QueueTouchJump();return;}
                else if(Star(3).gameObject.activeSelf && x>132.4f && x<135 && r.Grounded)starTarget=3;
                else if(Star(4).gameObject.activeSelf && ferryBoarded && r.Grounded && ferry.transform.position.x>165.4f && ferry.transform.position.x<167.1f)starTarget=4;
                if(starTarget>0){r.QueueTouchJump();return;}
            }
            if(GuardedTrap(94,99.5f,96.7f,"Barbarian_108") || GuardedTrap(194,199.5f,196.7f,"Barbarian_208"))return;
            foreach(var j in jumps)if(x>=j && x<j+.75f && r.Grounded)r.QueueTouchJump();
            // An evasive jump must land on solid ground before committing to a gap.
            foreach(var edge in new[]{24.4f,33.6f,67.3f,112.3f,149.6f,177.1f,223.5f})
                if(x>edge-1.5f && x<edge && !r.Grounded){landingBeforeGap=true;r.TouchAxis=0;return;}
            foreach(var block in FindObjectsByType<BreakableBlock>(FindObjectsSortMode.None))
                if(!block.IsBroken && block.grantsAxes && weapon.Ammo<4 && Mathf.Abs(x-block.transform.position.x)<.48f)
                {r.TouchAxis=0;if(r.Grounded)r.QueueTouchJump();return;}
            if(x>60.1f && x<61.15f && r.Grounded && r.transform.position.y>3)
                foreach(var guard in FindObjectsByType<PatrolEnemy>(FindObjectsSortMode.None))
                    if(guard.name=="Encounter_Rogue_Bridge" && guard.Alive && (guard.transform.position.x>62.1f || guard.Facing>0))
                    {r.TouchAxis=0;return;}
            foreach(var enemy in FindObjectsByType<PatrolEnemy>(FindObjectsSortMode.None))
            {
                var distance=enemy.transform.position.x-x;
                if(enemy.GetComponent<EnemyMeleeAttack>()!=null)continue;
                var blocked=false;
                foreach(var press in FindObjectsByType<MovingHazard>(FindObjectsSortMode.None))
                    if(press.travel.y<0 && press.transform.position.x>x && press.transform.position.x<enemy.transform.position.x)blocked=true;
                if(blocked)continue;
                if(enemy.Alive && distance>0 && distance<8f && Mathf.Abs(r.transform.position.y-enemy.transform.position.y)<1.5f && weapon.Ammo>0)
                {
                    if(distance<3.6f){r.TouchAxis=1;if(r.Grounded){if(distance<1.9f)weapon.TryThrow();r.QueueTouchJump();}}
                    else if(distance>7.5f){r.TouchAxis=0;weapon.TryThrow();}
                    else r.TouchAxis=1;
                    return;
                }
            }
            if(x>56.4f && x<59.8f && r.transform.position.y>3.6f)r.TouchAxis=0;
            foreach(var press in FindObjectsByType<MovingHazard>(FindObjectsSortMode.None))
                if((press.name=="Crusher_Blue" || press.name.StartsWith("Encounter_Crusher_")) &&
                    x>press.transform.position.x-3.7f && x<press.transform.position.x-2.7f &&
                    (press.transform.position.y<5.4f || press.VerticalVelocity<0))r.TouchAxis=0;
            if(ferry!=null && x>160.5f && x<163 && !ferryBoarded)
            {
                r.TouchAxis=0;
                if(ferry.transform.position.x<164.7f && ferry.SurfaceVelocity.x>=0 && r.Grounded){r.TouchAxis=1;r.QueueTouchJump();ferryBoarded=true;}
            }
            if(ferryBoarded && x>162 && x<170)
            {
                var dx=ferry.transform.position.x-x;r.TouchAxis=r.Grounded?0:Mathf.Clamp(dx*2,-1,1);
                if(r.Grounded && ferry.transform.position.x>167.3f){r.TouchAxis=1;r.QueueTouchJump();ferryBoarded=false;}
            }
        }
    }
}
