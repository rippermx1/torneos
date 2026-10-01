using System;
using UnityEngine;

namespace Orbit.AlienRun
{
    public sealed class AxeProjectile : MonoBehaviour
    {
        public RunSession session;
        public Vector3 velocity;
        public Transform visual;
        public bool hostile;
        private float age;
        private void FixedUpdate()
        {
            if (session == null || session.State != RunState.Playing) { Destroy(gameObject); return; }
            var dt = Time.fixedDeltaTime;
            age += dt;
            if (age > 3f) { Destroy(gameObject); return; }
            velocity += Vector3.down * (19.6f * dt);
            var delta = velocity * dt;
            var hits = Physics.SphereCastAll(transform.position, .18f, delta.normalized,
                delta.magnitude, ~0, QueryTriggerInteraction.Collide);
            Array.Sort(hits, (a,b) => a.distance.CompareTo(b.distance));
            foreach (var hit in hits)
            {
                if (hit.collider.GetComponentInParent<RunnerMotor>() != null) {
                    if(!hostile)continue;
                    if(session.PlayerVulnerable){
#if UNITY_EDITOR || DEVELOPMENT_BUILD
                        Debug.Log("Hostile axe hit at "+session.runner.transform.position);
#endif
                        session.Respawn();
                    }
                    Destroy(gameObject);return;
                }
                var enemy = hit.collider.GetComponentInParent<PatrolEnemy>();
                var block = hit.collider.GetComponentInParent<BreakableBlock>();
                if (enemy != null) {if(hostile)continue;enemy.Defeat();}
                else if (block != null) block.Break(session);
                else if (hit.collider.isTrigger) continue;
                Destroy(gameObject); return;
            }
            transform.position += delta;
            if (visual != null) visual.Rotate(0f, 0f, -Mathf.Sign(velocity.x) * 720f * dt, Space.World);
        }
    }
}
