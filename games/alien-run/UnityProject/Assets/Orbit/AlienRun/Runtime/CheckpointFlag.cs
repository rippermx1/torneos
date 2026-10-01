using UnityEngine;
namespace Orbit.AlienRun
{
    public sealed class CheckpointFlag : MonoBehaviour
    {
        public RunSession session;
        public Vector3 respawnPoint;
        public bool IsActive {get;private set;}
        private Mesh wavingMesh;
        private Vector3[] original,vertices;
        private Vector3 initialScale;
        private Renderer[] renderers;
        private MaterialPropertyBlock properties;
        private float activated=-100f;
        private void Awake()
        {
            initialScale=transform.localScale;renderers=GetComponentsInChildren<Renderer>();properties=new MaterialPropertyBlock();
            var filter=GetComponentInChildren<MeshFilter>();
            if(filter!=null && filter.sharedMesh!=null && filter.sharedMesh.isReadable) {
                wavingMesh=filter.mesh;original=wavingMesh.vertices;vertices=(Vector3[])original.Clone();
            }
        }
        public void ResetForRun(){IsActive=false;activated=-100;transform.localScale=initialScale;}
        private void Update()
        {
            if(session==null)return;
            var p=session.runner.transform.position;
            if(!IsActive && Mathf.Abs(p.x-respawnPoint.x)<1.5f && Mathf.Abs(p.y-respawnPoint.y)<3f && session.ActivateCheckpoint(this)) {
                IsActive=true;activated=Time.time;
            }
            var age=Time.time-activated;
            transform.localScale=initialScale*(1f+(age<.8f?Mathf.Sin(age/.8f*Mathf.PI)*.12f:0f));
            properties.SetColor("_BaseColor",age<.8f?Color.Lerp(new Color(1f,1.8f,.7f),Color.white,age/.8f):Color.white);
            foreach(var r in renderers)r.SetPropertyBlock(properties);
            if(wavingMesh==null)return;
            var b=wavingMesh.bounds;
            for(var i=0;i<original.Length;i++) {
                var v=original[i];var cloth=v.y>b.min.y+b.size.y*.55f && v.x>b.min.x+b.size.x*.3f;
                if(cloth)v.z+=Mathf.Sin(Time.time*4f+v.x*3f)*(IsActive?.12f:.035f);
                vertices[i]=v;
            }
            wavingMesh.vertices=vertices;
        }
        private void OnDestroy(){if(wavingMesh!=null)Destroy(wavingMesh);}
    }
}
