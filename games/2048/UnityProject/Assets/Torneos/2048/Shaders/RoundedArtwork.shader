Shader "Torneos/UI/RoundedArtwork"
{
    Properties
    {
        [PerRendererData] _MainTex ("Artwork", 2D) = "white" {}
        _Color ("Tint", Color) = (1,1,1,1)
        _StencilComp ("Stencil Comparison", Float) = 8
        _Stencil ("Stencil ID", Float) = 0
        _StencilOp ("Stencil Operation", Float) = 0
        _StencilWriteMask ("Stencil Write Mask", Float) = 255
        _StencilReadMask ("Stencil Read Mask", Float) = 255
        _ColorMask ("Color Mask", Float) = 15
    }
    SubShader
    {
        Tags { "Queue"="Transparent" "RenderType"="Transparent" "IgnoreProjector"="True" "CanUseSpriteAtlas"="False" }
        Stencil { Ref [_Stencil] Comp [_StencilComp] Pass [_StencilOp] ReadMask [_StencilReadMask] WriteMask [_StencilWriteMask] }
        Cull Off
        Lighting Off
        ZWrite Off
        ZTest [unity_GUIZTestMode]
        Blend SrcAlpha OneMinusSrcAlpha
        ColorMask [_ColorMask]
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0
            #include "UnityCG.cginc"
            struct appdata { float4 vertex : POSITION; float4 color : COLOR; float2 uv : TEXCOORD0; };
            struct v2f { float4 position : SV_POSITION; float4 color : COLOR; float2 uv : TEXCOORD0; };
            sampler2D _MainTex;
            fixed4 _Color;
            v2f vert(appdata input) {
                v2f output; output.position = UnityObjectToClipPos(input.vertex);
                output.uv = input.uv; output.color = input.color * _Color; return output;
            }
            fixed4 frag(v2f input) : SV_Target {
                // Keep the generated artwork's quiet interior. A UI silhouette controls
                // opacity: automatic background removal can leave holes in white art.
                float2 corner = abs(input.uv - .5) - .42;
                float distance = length(max(corner, 0)) + min(max(corner.x, corner.y), 0) - .08;
                float coverage = 1 - smoothstep(-fwidth(distance), fwidth(distance), distance);
                fixed3 artwork = tex2D(_MainTex, .14 + input.uv * .72).rgb;
                return fixed4(artwork * input.color.rgb, coverage * input.color.a);
            }
            ENDCG
        }
    }
}
