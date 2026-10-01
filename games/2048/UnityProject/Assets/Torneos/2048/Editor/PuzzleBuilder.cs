using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEditor.Build.Reporting;
using UnityEditor.Build;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Torneos.Puzzle2048.Editor
{
    public static class PuzzleBuilder
    {
        public const string ScenePath="Assets/Torneos/2048/Scenes/Puzzle.unity";
        [MenuItem("Torneos/2048/Create scene")]
        public static void CreateScene() {
            foreach(var file in new[]{"tile-face-v1","background-v1"}) {
                string path="Assets/Torneos/2048/Resources/Gpt/"+file+".png";
                var importer=AssetImporter.GetAtPath(path) as TextureImporter;
                if(importer==null) throw new FileNotFoundException("Missing GPT artwork",path);
                importer.textureType=TextureImporterType.Sprite;importer.spriteImportMode=SpriteImportMode.Single;
                importer.alphaIsTransparency=true;importer.mipmapEnabled=false;importer.maxTextureSize=2048;importer.SaveAndReimport();
            }
            Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));
            var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            var camera=new GameObject("MainCamera",typeof(Camera));camera.tag="MainCamera";
            camera.GetComponent<Camera>().clearFlags=CameraClearFlags.SolidColor;camera.GetComponent<Camera>().backgroundColor=new Color(.06f,.17f,.19f);
            camera.transform.position=new Vector3(0,0,-10);camera.GetComponent<Camera>().orthographic=true;
            new GameObject("Torneos2048").AddComponent<PuzzleClient>();
            EditorSceneManager.SaveScene(scene,ScenePath);
            EditorBuildSettings.scenes=new[]{new EditorBuildSettingsScene(ScenePath,true)};
            PlayerSettings.companyName="TorneosPlay";PlayerSettings.productName="2048";PlayerSettings.bundleVersion=PuzzleClient.BuildId;
            PlayerSettings.WebGL.template="PROJECT:Torneos2048";
            PlayerSettings.WebGL.compressionFormat=WebGLCompressionFormat.Gzip;
            PlayerSettings.WebGL.decompressionFallback=false;
            PlayerSettings.SetManagedStrippingLevel(NamedBuildTarget.WebGL,ManagedStrippingLevel.High);
            PlayerSettings.stripEngineCode=true;
            PlayerSettings.WebGL.initialMemorySize=128;
            PlayerSettings.defaultScreenWidth=800;PlayerSettings.defaultScreenHeight=1000;
            AssetDatabase.SaveAssets();Debug.Log("TORNEOS_2048_SCENE_READY");
        }
        [MenuItem("Torneos/2048/Build WebGL")]
        public static void BuildWebGL() {
            if(SystemInfo.graphicsDeviceType==UnityEngine.Rendering.GraphicsDeviceType.Null) throw new InvalidOperationException("Build with graphics enabled");
            CreateScene();
            string output="Builds/WebGL/"+PuzzleClient.BuildId;
            var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions {scenes=new[]{ScenePath},target=BuildTarget.WebGL,locationPathName=output,options=BuildOptions.None});
            if(report.summary.result!=BuildResult.Succeeded) throw new Exception("Build failed: "+report.summary.result);
            File.WriteAllText(output+"/build-manifest.json",JsonUtility.ToJson(new Manifest(),true));
            Debug.Log("TORNEOS_2048_BUILD_OK "+report.summary.totalSize);
        }
        [Serializable] class Manifest { public string game_id="2048",build_id=PuzzleClient.BuildId,channel="torneos.2048",rules_version="2048_score_existing_server",integrity="server_moves_not_human_proof"; }
    }
}
