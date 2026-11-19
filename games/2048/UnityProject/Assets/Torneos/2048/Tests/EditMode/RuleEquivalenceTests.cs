using System;
using System.IO;
using NUnit.Framework;
using UnityEngine;

namespace Torneos.Puzzle2048.Tests
{
    public class RuleEquivalenceTests
    {
        [Serializable] public class RuleCase {
            public string id, direction;
            public int[] before, after;
            public int initialScore, scoreGained;
            public bool moved, canMoveBefore, canMoveAfterSlide;
        }
        [Serializable] public class Corpus { public int schema; public RuleCase[] cases; }
        static Corpus Load() {
            var path = Path.Combine(Application.dataPath, "Torneos/2048/Tests/EditMode/Fixtures/rule-cases.json");
            var corpus = JsonUtility.FromJson<Corpus>(File.ReadAllText(path));
            Assert.AreEqual(1, corpus.schema);
            Assert.AreEqual(2936, corpus.cases.Length);
            return corpus;
        }

        [Test] public void SlidesAndScoresMatchTheServerCorpus() {
            foreach (var c in Load().cases) {
                var board = new PracticeBoard(c.before, c.initialScore);
                Assert.AreEqual(c.canMoveBefore, board.CanMove(), c.id);
                Assert.AreEqual(c.moved, board.Slide(c.direction), c.id);
                CollectionAssert.AreEqual(c.after, board.Cells, c.id);
                Assert.AreEqual(c.initialScore + c.scoreGained, board.Score, c.id);
                Assert.AreEqual(c.canMoveAfterSlide, board.CanMove(), c.id);
            }
        }

        [Test] public void MovesSpawnExactlyOneValidTileOnlyWhenChanged() {
            foreach (var c in Load().cases) {
                var input = (int[])c.before.Clone();
                var board = new PracticeBoard(input, c.initialScore);
                Assert.AreEqual(c.moved, board.Move(c.direction), c.id);
                CollectionAssert.AreEqual(c.before, input, c.id + " input snapshot");
                Assert.AreEqual(c.initialScore + c.scoreGained, board.Score, c.id);
                int spawned = 0;
                for (int i = 0; i < 16; i++) {
                    if (c.after[i] == board.Cells[i]) continue;
                    Assert.AreEqual(0, c.after[i], c.id + " spawn must use an empty cell");
                    Assert.IsTrue(board.Cells[i] == 2 || board.Cells[i] == 4, c.id + " spawn value");
                    spawned++;
                }
                Assert.AreEqual(c.moved ? 1 : 0, spawned, c.id);
                if (c.id == "horizontal-only-left" || c.id == "vertical-only-up") {
                    // Either allowed spawn value fills the final cell without a merge.
                    foreach (var value in board.Cells) Assert.Greater(value, 0, c.id);
                    Assert.IsFalse(board.CanMove(), c.id + " terminal after spawn");
                }
            }
        }

        [Test] public void NoOpAndInvalidDirectionDoNotAdvanceOfflineRandomness() {
            var cells = new[] { 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 };
            var first = new PracticeBoard(cells, 123);
            var second = new PracticeBoard(cells, 123);
            Assert.IsFalse(first.Move("left"));
            Assert.IsFalse(first.Move("invalid"));
            Assert.AreEqual(123, first.Score);
            CollectionAssert.AreEqual(cells, first.Cells);
            Assert.IsTrue(first.Move("right"));
            Assert.IsTrue(second.Move("right"));
            CollectionAssert.AreEqual(second.Cells, first.Cells);
        }

        [Test] public void OfflineRandomnessCanSpawnBothTwoAndFour() {
            var board = new PracticeBoard(1);
            bool sawTwo = false, sawFour = false;
            for (int move = 0; move < 64; move++) {
                // Reset geometry only, preserving the real offline RNG sequence.
                Array.Clear(board.Cells, 0, board.Cells.Length);
                board.Cells[0] = 2;
                Assert.IsTrue(board.Move("right"));
                Assert.AreEqual(2, board.Cells[3]);
                int spawned = 0;
                for (int i = 0; i < 16; i++) {
                    if (i == 3 || board.Cells[i] == 0) continue;
                    Assert.IsTrue(board.Cells[i] == 2 || board.Cells[i] == 4);
                    sawTwo |= board.Cells[i] == 2;
                    sawFour |= board.Cells[i] == 4;
                    spawned++;
                }
                Assert.AreEqual(1, spawned);
                Assert.AreEqual(0, board.Score);
            }
            Assert.IsTrue(sawTwo && sawFour);
        }
    }
}
