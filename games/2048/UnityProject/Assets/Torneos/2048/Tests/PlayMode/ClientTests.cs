using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using UnityEngine.UI;
namespace Torneos.Puzzle2048.Tests {
    public class ClientTests {
        [UnityTest] public IEnumerator AuthoritativeBoardIsRenderedWithGptArtwork() {
            var g=new GameObject("Torneos2048");var c=g.AddComponent<PuzzleClient>();yield return null;
            c.ApplyState(new PuzzleState {cells=new[]{2048,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},score=987,locked=true,message="Partida competitiva"});
            var tile=GameObject.Find("Cell0").GetComponent<Image>();Assert.IsNotNull(tile.sprite);Assert.AreEqual("2048",tile.GetComponentInChildren<Text>().text);
            Assert.AreEqual("PUNTAJE  987",GameObject.Find("Score").GetComponent<Text>().text);
            foreach(var name in new[]{"LeftText","UpText","DownText","RightText"}) {
                var label=GameObject.Find(name).GetComponent<Text>();
                Assert.IsTrue(label.font.HasCharacter(label.text[0]),"A pointer control must have a visible glyph");
            }
            c.RequestDirection("left");Assert.AreEqual("2048",tile.GetComponentInChildren<Text>().text,"Locked state must not move");
            Object.Destroy(g);Object.Destroy(GameObject.Find("PuzzleCanvas"));Object.Destroy(GameObject.Find("EventSystem"));yield return null;
        }
    }
}
