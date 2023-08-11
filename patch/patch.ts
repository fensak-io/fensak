import { IHunk, ILineDiff, LineOp } from "./patch_types.ts";

/**
 * Parse a unified diff text into a list of hunks.
 * @param diffTxt The full text of a patch diff to turn into hunk objects.
 * @returns The list of hunks.
 */
export function parseUnifiedDiff(diffTxt: string): IHunk[] {
  const hunkStartLineRE =
    /@@\s+-(?<originalStart>\d+),?(?<originalLength>\d*)?\s+\+(?<updatedStart>\d+),?(?<updatedLength>\d*)?\s+@@/;
  const hunks: IHunk[] = [];
  let curHunk: IHunk | null = null;
  for (const line of diffTxt.split("\n")) {
    const maybeStart = hunkStartLineRE.exec(line);
    if (maybeStart) {
      if (curHunk != null) {
        curHunk.diffOperations = reduceOperations(curHunk.diffOperations);
        hunks.push(curHunk);
      }
      const cg = maybeStart.groups;
      if (!cg) {
        throw new Error("Could not parse hunk");
      }
      curHunk = {
        originalStart: parseInt(cg.originalStart),
        originalLength: parseInt(cg.originalLength),
        updatedStart: parseInt(cg.updatedStart),
        updatedLength: parseInt(cg.updatedLength),
        diffOperations: [],
      };
    } else if (curHunk != null) {
      let op: LineOp;
      switch (line[0]) {
        default:
          op = LineOp.Unknown;
          break;
        case "+":
          op = LineOp.Insert;
          break;
        case "-":
          op = LineOp.Delete;
          break;
        case " ":
          op = LineOp.Untouched;
          break;
      }
      curHunk.diffOperations.push({
        op: op,
        text: line.slice(1),
        newText: "",
      });
    }
  }
  // Reconcile last one
  if (curHunk != null) {
    curHunk.diffOperations = reduceOperations(curHunk.diffOperations);
    hunks.push(curHunk);
  }
  return hunks;
}

function reduceOperations(diffOps: ILineDiff[]): ILineDiff[] {
  const outOps: ILineDiff[] = [];
  let i = 0;
  while (i < diffOps.length) {
    const lop = diffOps[i];
    if (lop.op != LineOp.Delete) {
      outOps.push(lop);
      i++;
      continue;
    }

    const [toReduce, toConsume] = canReduce(diffOps.slice(i));
    if (!toReduce) {
      // Can not be reduced, so consume until the evaluated boundary.
      for (let j = i; j < i + toConsume; j++) {
        outOps.push(diffOps[j]);
      }
      i += toConsume;
      continue;
    }

    // Can be reduced, so reduce the inserts with the deletes, and then advance toConsume elements.
    const opsToReduce = diffOps.slice(i, i + toConsume);
    const reduced = combineInsertsWithDeletes(opsToReduce);
    outOps.push(...reduced);
    i += toConsume;
  }
  return outOps;
}

function combineInsertsWithDeletes(diffOps: ILineDiff[]): ILineDiff[] {
  if (diffOps.length % 2 != 0) {
    throw new Error(
      `combineInsertsWithDeletes expects even diffOps length: ${diffOps.length}`,
    );
  }

  const out: ILineDiff[] = [];
  let pos = 0;
  for (const lop of diffOps) {
    if (lop.op == LineOp.Delete) {
      // Find the corresponding insert operation
      const insertLOp = findCorrespondingInsert(pos, diffOps);
      if (insertLOp == null) {
        throw new Error(
          `combineInsertsWithDeletes could not find corresponding insert operation for deletion ${pos}`,
        );
      }
      out.push({
        op: LineOp.Modified,
        text: lop.text,
        newText: insertLOp.text,
      });
      pos++;
    } else if (lop.op == LineOp.Insert) {
      // Ignore insert operations since they will be handled while processing the corresponding delete operation.
      continue;
    } else {
      throw new Error(
        `combineInsertsWithDeletes only expects line diffs with inserts or deletes: ${lop.op}`,
      );
    }
  }
  if (out.length != diffOps.length / 2) {
    throw new Error(
      `combineInsertsWithDeletes should have reduced diff ops by half: diffOps length ${diffOps.length}; out length ${out.length}`,
    );
  }
  return out;
}

function findCorrespondingInsert(
  pos: number,
  diffOps: ILineDiff[],
): ILineDiff | null {
  let insertPos = 0;
  for (const lop of diffOps) {
    if (lop.op != LineOp.Insert) {
      continue;
    }

    if (insertPos == pos) {
      return lop;
    }
    insertPos++;
  }
  return null;
}

/**
 * Determine if the given diffOps starting with a deletion can be reduced. The operations can be reduced if there are
 * the same number of inserts as there are deletes until a non-insert/delete operation.
 * @param diffOps A list of line diffs where it starts with a delete. If it doesn't, the diff can not be reduced.
 * @returns A tuple where the first element is a boolean indicating whether the diff operations can be reduced, and a
 *          number indicating how many operations to consume by reducing.
 */
function canReduce(diffOps: ILineDiff[]): [boolean, number] {
  if (diffOps[0].op != LineOp.Delete) {
    return [false, 1];
  }

  let inserts = 0;
  let deletions = 0;
  for (let i = 0; i < diffOps.length; i++) {
    const lop = diffOps[i];
    switch (lop.op) {
      default:
        return [inserts == deletions, i];
      case LineOp.Insert:
        inserts++;
        break;
      case LineOp.Delete:
        deletions++;
        break;
    }
  }
  return [inserts == deletions, diffOps.length];
}
