using System.Collections;
using NUnit.Framework;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.TestTools;

namespace Torneos.Puzzle2048.Tests {
    public class ClientTests {
        GameObject root; PuzzleClient client;
        [UnitySetUp] public IEnumerator Setup() {
            root = new GameObject("Torneos2048"); client = root.AddComponent<PuzzleClient>(); yield return null;
        }
        [UnityTearDown] public IEnumerator Cleanup() { Object.Destroy(root); yield return null; }
        static int[] Cells(params int[] row) { var cells = new int[16]; row.CopyTo(cells,0); return cells; }

        [UnityTest] public IEnumerator AuthoritativeBoardAndOnlyScoreAreRendered() {
            client.ApplyState(new PuzzleState { cells = Cells(2048), score = 12345, locked = true, move_number = 2 });
            var tile = GameObject.Find("Cell0").GetComponent<UnityEngine.UI.Image>();
            Assert.IsNotNull(tile.sprite);
            Assert.AreEqual("Torneos/UI/RoundedArtwork",tile.material.shader.name);
            Assert.AreEqual(new Vector4(0,0,1,1),UnityEngine.Sprites.DataUtility.GetOuterUV(tile.sprite),"The rounded surface requires a full sprite rectangle");
            Assert.AreEqual("2048",tile.GetComponentInChildren<TextMeshProUGUI>().text);
            Assert.AreEqual("12.345",GameObject.Find("Score").GetComponent<TextMeshProUGUI>().text);
            var font = GameObject.Find("Score").GetComponent<TextMeshProUGUI>().font;
            foreach (char glyph in "0123456789PUNTAJE+.,") Assert.IsTrue(font.HasCharacter(glyph));
            Assert.AreEqual(0,Object.FindObjectsByType<UnityEngine.UI.Button>(FindObjectsSortMode.None).Length);
            foreach (var name in new[] {"Title","Brand","Time","Restart","Status"}) Assert.IsNull(GameObject.Find(name));
            client.RequestDirection("left");
            Assert.AreEqual("2048",tile.GetComponentInChildren<TextMeshProUGUI>().text);
            yield return null;
        }
        [UnityTest] public IEnumerator MergeSlidesPopsAndSettlesWithoutRepeatingOnClockUpdates() {
            client.ApplyState(new PuzzleState { cells = Cells(2,2), score = 0, move_number = 2 });
            client.RequestDirection("left"); Assert.IsTrue(client.IsAnimating);
            Assert.IsNotNull(GameObject.Find("MovingTile"));
            yield return new WaitForSecondsRealtime(.40f);
            Assert.IsFalse(client.IsAnimating);
            Assert.AreEqual("4",GameObject.Find("Cell0").GetComponentInChildren<TextMeshProUGUI>().text);
            Assert.AreEqual("4",GameObject.Find("Score").GetComponent<TextMeshProUGUI>().text);
            Assert.AreEqual(Vector3.one,GameObject.Find("Cell0").transform.localScale);
            // Same board notification (as used by the timer) must not animate again.
            var image = new int[16];
            for(int i=0;i<16;i++) {
                var cell = GameObject.Find("Board").transform.Find("Cell"+i);
                image[i] = int.TryParse(cell.GetComponentInChildren<TextMeshProUGUI>(true).text,out var n)?n:0;
            }
            client.ApplyState(new PuzzleState { cells=image,score=4,move_number=3,locked=true });
            Assert.IsFalse(client.IsAnimating); Assert.IsNull(GameObject.Find("MovingTile"));
        }
        [UnityTest] public IEnumerator PlatformResetCancelsMotionAndNoOpDoesNotAnimate() {
            client.ApplyState(new PuzzleState { cells=Cells(2,2),move_number=2 });
            client.RequestDirection("left"); Assert.IsTrue(client.IsAnimating);
            client.ApplyState(new PuzzleState { cells=Cells(2),move_number=2 });
            Assert.IsFalse(client.IsAnimating); Assert.AreEqual("0",GameObject.Find("Score").GetComponent<TextMeshProUGUI>().text);
            yield return new WaitForSecondsRealtime(.1f);
            client.RequestDirection("left"); Assert.IsFalse(client.IsAnimating);
        }
        [UnityTest] public IEnumerator ReducedMotionSkipsEffectsAndSwipeMovesOnlyOnce() {
            client.ApplyState(new PuzzleState { cells=Cells(2,2),move_number=2,reduced_motion=true });
            client.RequestDirection("left"); Assert.IsFalse(client.IsAnimating);
            yield return new WaitForSecondsRealtime(.1f);
            client.ApplyState(new PuzzleState { cells=Cells(2,2),move_number=2 });
            var swipe=GameObject.Find("Board").GetComponent<BoardSwipe>();
            var e=new PointerEventData(EventSystem.current) {pointerId=1,position=new Vector2(400,400)};
            swipe.OnPointerDown(e); e.position=new Vector2(200,400); swipe.OnPointerUp(e); swipe.OnEndDrag(e);
            Assert.IsTrue(client.IsAnimating);
            yield return new WaitForSecondsRealtime(.4f);
            Assert.AreEqual("4",GameObject.Find("Score").GetComponent<TextMeshProUGUI>().text);
        }
    }
}
