using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;

namespace Orbit.AlienRun
{
    [RequireComponent(typeof(UnityEngine.UI.Image))]
    public sealed class TouchHoldButton : MonoBehaviour, IPointerDownHandler, IPointerUpHandler, IPointerExitHandler
    {
        private readonly HashSet<int> pointers = new HashSet<int>();
        private UnityEngine.UI.Image image;
        private static readonly Color NormalColor = new Color(0.08f, 0.15f, 0.19f, 0.86f);
        private static readonly Color PressedColor = new Color(0.35f, 0.52f, 0.25f, 0.94f);
        public bool IsPressed => pointers.Count > 0;

        private void Awake()
        {
            image = GetComponent<UnityEngine.UI.Image>();
            image.color = NormalColor;
        }

        public void OnPointerDown(PointerEventData eventData)
        {
            pointers.Add(eventData.pointerId);
            image.color = PressedColor;
        }

        public void OnPointerUp(PointerEventData eventData) => Release(eventData.pointerId);
        public void OnPointerExit(PointerEventData eventData) => Release(eventData.pointerId);

        private void Release(int pointerId)
        {
            pointers.Remove(pointerId);
            if (!IsPressed) image.color = NormalColor;
        }

        public void Clear()
        {
            pointers.Clear();
            if (image != null) image.color = NormalColor;
        }

        private void OnDisable() => Clear();
    }
}
