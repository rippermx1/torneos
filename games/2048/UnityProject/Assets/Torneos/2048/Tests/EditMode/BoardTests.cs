using NUnit.Framework;
namespace Torneos.Puzzle2048.Tests
{
    public class BoardTests {
        [Test] public void FourEqualTilesMergeOnceEach() {
            var b=new PracticeBoard(new[]{2,2,2,2,0,0,0,0,0,0,0,0,0,0,0,0});Assert.IsTrue(b.Slide("left"));
            CollectionAssert.AreEqual(new[]{4,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0},b.Cells);Assert.AreEqual(8,b.Score);
        }
        [TestCase("left",0,1,0)] [TestCase("right",0,1,3)] [TestCase("up",0,4,0)] [TestCase("down",0,4,12)]
        public void DirectionHasCorrectOrientation(string direction,int a,int b,int expected) {
            var cells=new int[16];cells[a]=2;cells[b]=2;var board=new PracticeBoard(cells);board.Slide(direction);
            Assert.AreEqual(4,board.Cells[expected]);Assert.AreEqual(4,board.Score);
        }
        [Test] public void NoOpDoesNotSpawnOrScore() {
            var board=new PracticeBoard(new[]{2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0});Assert.IsFalse(board.Move("left"));
            Assert.AreEqual(2,board.Cells[0]);Assert.AreEqual(0,board.Score);Assert.AreEqual(0,board.Cells[1]);
        }
        [Test] public void TerminalBoardIsRecognized() { var b=new PracticeBoard(new[]{2,4,2,4,4,2,4,2,2,4,2,4,4,2,4,2});Assert.IsFalse(b.CanMove()); }
        [Test] public void NewPracticeHasExactlyTwoTiles() { var b=new PracticeBoard();int count=0;foreach(var n in b.Cells)if(n>0)count++;Assert.AreEqual(2,count);Assert.AreEqual(0,b.Score); }
    }
}
