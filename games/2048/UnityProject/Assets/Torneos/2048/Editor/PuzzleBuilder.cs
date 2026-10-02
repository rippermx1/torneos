using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEditor.Build.Reporting;
using UnityEditor.Build;
using UnityEngine;
using UnityEngine.SceneManagement;
using TMPro;
using UnityEngine.TextCore.LowLevel;

namespace Torneos.Puzzle2048.Editor
{
    public static class PuzzleBuilder
    {
        public const string ScenePath="Assets/Torneos/2048/Scenes/Puzzle.unity";
        [MenuItem("Torneos/2048/Create scene")]
        public static void CreateScene() {
            if (File.Exists(ScenePath)) { ConfigureProject(); return; }
            Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));
            var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            var camera=new GameObject("MainCamera",typeof(Camera));camera.tag="MainCamera";
            camera.GetComponent<Camera>().clearFlags=CameraClearFlags.SolidColor;camera.GetComponent<Camera>().backgroundColor=new Color(.96f,.96f,.94f);
            camera.transform.position=new Vector3(0,0,-10);camera.GetComponent<Camera>().orthographic=true;
            new GameObject("Torneos2048").AddComponent<PuzzleClient>();
            EditorSceneManager.SaveScene(scene,ScenePath);
            ConfigureProject();
        }
        public static void ConfigureProject() {
            if (!File.Exists(ScenePath)) throw new FileNotFoundException("The existing game scene is required", ScenePath);
            foreach(var file in new[]{"tile-face-v3","background-v2"}) {
                string path="Assets/Torneos/2048/Resources/Gpt/"+file+".png";
                var importer=AssetImporter.GetAtPath(path) as TextureImporter;
                if(importer==null) throw new FileNotFoundException("Missing GPT artwork",path);
                importer.textureType=TextureImporterType.Sprite;importer.spriteImportMode=SpriteImportMode.Single;
                var textureSettings = new TextureImporterSettings(); importer.ReadTextureSettings(textureSettings);
                textureSettings.spriteMeshType = SpriteMeshType.FullRect; importer.SetTextureSettings(textureSettings);
                importer.alphaIsTransparency=true;importer.mipmapEnabled=false;importer.maxTextureSize=file.StartsWith("tile")?256:1024;importer.SaveAndReimport();
                var sprite = AssetDatabase.LoadAssetAtPath<Sprite>(path);
                Debug.Log("UI_ART_UV " + file + " " + UnityEngine.Sprites.DataUtility.GetOuterUV(sprite));
            }
            PrepareFont();
            const string surfacePath = "Assets/Torneos/2048/Resources/UI/RoundedArtwork.mat";
            if (AssetDatabase.LoadAssetAtPath<Material>(surfacePath) == null) {
                var shader = AssetDatabase.LoadAssetAtPath<Shader>("Assets/Torneos/2048/Shaders/RoundedArtwork.shader");
                if (shader == null) throw new FileNotFoundException("Rounded artwork shader is required");
                AssetDatabase.CreateAsset(new Material(shader),surfacePath);
            }
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
        public static void ImportTextResources() {
            if (!File.Exists("Assets/TextMesh Pro/Resources/TMP Settings.asset")) {
                var info = UnityEditor.PackageManager.PackageInfo.FindForAssetPath("Packages/com.unity.ugui");
                AssetDatabase.importPackageCompleted += _ => EditorApplication.Exit(0);
                AssetDatabase.importPackageFailed += (_,error) => { Debug.LogError(error); EditorApplication.Exit(1); };
                AssetDatabase.ImportPackage(Path.Combine(info.resolvedPath,"Package Resources/TMP Essential Resources.unitypackage"),false);
            } else EditorApplication.Exit(0);
        }
        static void PrepareFont() {
            if (TMP_Settings.LoadDefaultSettings() == null) throw new InvalidOperationException("Run ImportTextResources before preparing the font");
            const string fontPath = "Assets/Torneos/2048/Resources/UI/Inter-Score.asset";
            if (AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(fontPath) != null) return;
            var source = AssetDatabase.LoadAssetAtPath<Font>("Assets/Torneos/2048/Resources/UI/Inter-Regular.otf");
            if (source == null) throw new FileNotFoundException("Local Inter font is required");
            var font = TMP_FontAsset.CreateFontAsset(source,90,9,GlyphRenderMode.SDFAA,512,512,AtlasPopulationMode.Dynamic,false);
            font.name = "Inter-Score";
            if (!font.TryAddCharacters("0123456789PUNTAJE+., ")) throw new InvalidOperationException("Score glyphs did not fit the font atlas");
            font.atlasPopulationMode = AtlasPopulationMode.Static;
            AssetDatabase.CreateAsset(font,fontPath);
            font.material.name = "Inter-Score Material"; AssetDatabase.AddObjectToAsset(font.material,font);
            foreach (var texture in font.atlasTextures) { texture.name = "Inter-Score Atlas"; AssetDatabase.AddObjectToAsset(texture,font); }
            EditorUtility.SetDirty(font); AssetDatabase.SaveAssets();
        }
        [MenuItem("Torneos/2048/Build WebGL")]
        public static void BuildWebGL() {
            if(SystemInfo.graphicsDeviceType==UnityEngine.Rendering.GraphicsDeviceType.Null) throw new InvalidOperationException("Build with graphics enabled");
            ConfigureProject();
            string output="Builds/WebGL/"+PuzzleClient.BuildId;
            var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions {scenes=new[]{ScenePath},target=BuildTarget.WebGL,locationPathName=output,options=BuildOptions.None});
            if(report.summary.result!=BuildResult.Succeeded) throw new Exception("Build failed: "+report.summary.result);
            File.WriteAllText(output+"/build-manifest.json",JsonUtility.ToJson(new Manifest(),true));
            Debug.Log("TORNEOS_2048_BUILD_OK "+report.summary.totalSize);
        }
        [Serializable] class Manifest { public string game_id="2048",build_id=PuzzleClient.BuildId,channel="torneos.2048",rules_version="2048_score_existing_server",integrity="server_moves_not_human_proof"; }
    }
}
