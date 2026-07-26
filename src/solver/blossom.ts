// Converted to JS from Python by Matt Krick. Original: http://jorisvr.nl/maximummatching.html
// Ported to TypeScript

class Edmonds {
  edges: [number, number, number][];
  maxCardinality: boolean;
  nEdge: number;
  nVertex = 0;
  maxWeight = 0;
  endpoint: number[] = [];
  neighbend: number[][] = [];
  mate: number[] = [];
  label: number[] = [];
  labelEnd: number[] = [];
  inBlossom: number[] = [];
  blossomParent: number[] = [];
  blossomChilds: number[][] = [];
  blossomBase: number[] = [];
  blossomEndPs: number[][] = [];
  bestEdge: number[] = [];
  blossomBestEdges: number[][] = [];
  unusedBlossoms: number[] = [];
  dualVar: number[] = [];
  allowEdge: boolean[] = [];
  queue: number[] = [];

  constructor(edges: [number, number, number][], maxCardinality: boolean) {
    this.edges = edges;
    this.maxCardinality = maxCardinality;
    this.nEdge = edges.length;
    this.init();
  }

  maxWeightMatching(): number[] {
    for (let t = 0; t < this.nVertex; t++) {
      this.label = filledArray(2 * this.nVertex, 0);
      this.bestEdge = filledArray(2 * this.nVertex, -1);
      this.blossomBestEdges = initArrArr(2 * this.nVertex);
      this.allowEdge = filledArray(this.nEdge, false);
      this.queue = [];
      for (let v = 0; v < this.nVertex; v++) {
        if (this.mate[v] === -1 && this.label[this.inBlossom[v]] === 0) {
          this.assignLabel(v, 1, -1);
        }
      }
      let augmented = false;
      while (true) {
        let v: number;
        while (this.queue.length > 0 && !augmented) {
          v = this.queue.pop()!;
          for (let ii = 0; ii < this.neighbend[v].length; ii++) {
            const p = this.neighbend[v][ii];
            const k = ~~(p / 2);
            const w = this.endpoint[p];
            if (this.inBlossom[v] === this.inBlossom[w]) continue;
            if (!this.allowEdge[k]) {
              const kSlack = this.slack(k);
              if (kSlack <= 0) {
                this.allowEdge[k] = true;
              }
            }
            if (this.allowEdge[k]) {
              if (this.label[this.inBlossom[w]] === 0) {
                this.assignLabel(w, 2, p ^ 1);
              } else if (this.label[this.inBlossom[w]] === 1) {
                const base = this.scanBlossom(v, w);
                if (base >= 0) {
                  this.addBlossom(base, k);
                } else {
                  this.augmentMatching(k);
                  augmented = true;
                  break;
                }
              } else if (this.label[w] === 0) {
                this.label[w] = 2;
                this.labelEnd[w] = p ^ 1;
              }
            } else if (this.label[this.inBlossom[w]] === 1) {
              const b = this.inBlossom[v];
              if (this.bestEdge[b] === -1 || this.slack(k) < this.slack(this.bestEdge[b])) {
                this.bestEdge[b] = k;
              }
            } else if (this.label[w] === 0) {
              if (this.bestEdge[w] === -1 || this.slack(k) < this.slack(this.bestEdge[w])) {
                this.bestEdge[w] = k;
              }
            }
          }
        }
        if (augmented) break;
        let deltaType = -1;
        let delta = 0;
        let deltaEdge = -1;
        let deltaBlossom = 0;
        if (!this.maxCardinality) {
          deltaType = 1;
          delta = getMin(this.dualVar, 0, this.nVertex - 1);
        }
        for (v = 0; v < this.nVertex; v++) {
          if (this.label[this.inBlossom[v]] === 0 && this.bestEdge[v] !== -1) {
            const d = this.slack(this.bestEdge[v]);
            if (deltaType === -1 || d < delta) {
              delta = d;
              deltaType = 2;
              deltaEdge = this.bestEdge[v];
            }
          }
        }
        for (let b = 0; b < 2 * this.nVertex; b++) {
          if (this.blossomParent[b] === -1 && this.label[b] === 1 && this.bestEdge[b] !== -1) {
            const kSlack = this.slack(this.bestEdge[b]);
            const d = kSlack / 2;
            if (deltaType === -1 || d < delta) {
              delta = d;
              deltaType = 3;
              deltaEdge = this.bestEdge[b];
            }
          }
        }
        for (let b = this.nVertex; b < this.nVertex * 2; b++) {
          if (this.blossomBase[b] >= 0 && this.blossomParent[b] === -1 && this.label[b] === 2 && (deltaType === -1 || this.dualVar[b] < delta)) {
            delta = this.dualVar[b];
            deltaType = 4;
            deltaBlossom = b;
          }
        }
        if (deltaType === -1) {
          deltaType = 1;
          delta = Math.max(0, getMin(this.dualVar, 0, this.nVertex - 1));
        }
        for (v = 0; v < this.nVertex; v++) {
          const curLabel = this.label[this.inBlossom[v]];
          if (curLabel === 1) {
            this.dualVar[v] -= delta;
          } else if (curLabel === 2) {
            this.dualVar[v] += delta;
          }
        }
        for (let b = this.nVertex; b < this.nVertex * 2; b++) {
          if (this.blossomBase[b] >= 0 && this.blossomParent[b] === -1) {
            if (this.label[b] === 1) {
              this.dualVar[b] += delta;
            } else if (this.label[b] === 2) {
              this.dualVar[b] -= delta;
            }
          }
        }
        if (deltaType === 1) {
          break;
        } else if (deltaType === 2) {
          this.allowEdge[deltaEdge] = true;
          let i = this.edges[deltaEdge][0];
          let j = this.edges[deltaEdge][1];
          if (this.label[this.inBlossom[i]] === 0) {
            i = i ^ j;
            j = j ^ i;
            i = i ^ j;
          }
          this.queue.push(i);
        } else if (deltaType === 3) {
          this.allowEdge[deltaEdge] = true;
          let i = this.edges[deltaEdge][0];
          this.queue.push(i);
        } else if (deltaType === 4) {
          this.expandBlossom(deltaBlossom, false);
        }
      }
      if (!augmented) break;
      for (let b = this.nVertex; b < this.nVertex * 2; b++) {
        if (this.blossomParent[b] === -1 && this.blossomBase[b] >= 0 && this.label[b] === 1 && this.dualVar[b] === 0) {
          this.expandBlossom(b, true);
        }
      }
    }
    for (let v = 0; v < this.nVertex; v++) {
      if (this.mate[v] >= 0) {
        this.mate[v] = this.endpoint[this.mate[v]];
      }
    }
    return this.mate;
  }

  slack(k: number): number {
    const i = this.edges[k][0];
    const j = this.edges[k][1];
    const wt = this.edges[k][2];
    return this.dualVar[i] + this.dualVar[j] - 2 * wt;
  }

  blossomLeaves(b: number): number[] {
    if (b < this.nVertex) {
      return [b];
    }
    const leaves: number[] = [];
    const childList = this.blossomChilds[b];
    for (let t = 0; t < childList.length; t++) {
      if (childList[t] <= this.nVertex) {
        leaves.push(childList[t]);
      } else {
        const leafList = this.blossomLeaves(childList[t]);
        for (let v = 0; v < leafList.length; v++) {
          leaves.push(leafList[v]);
        }
      }
    }
    return leaves;
  }

  assignLabel(w: number, t: number, p: number): void {
    const b = this.inBlossom[w];
    this.label[w] = this.label[b] = t;
    this.labelEnd[w] = this.labelEnd[b] = p;
    this.bestEdge[w] = this.bestEdge[b] = -1;
    if (t === 1) {
      this.queue.push(...this.blossomLeaves(b));
    } else if (t === 2) {
      const base = this.blossomBase[b];
      this.assignLabel(this.endpoint[this.mate[base]], 1, this.mate[base] ^ 1);
    }
  }

  scanBlossom(v: number, w: number): number {
    const path: number[] = [];
    let base = -1;
    while (v !== -1 || w !== -1) {
      let b = this.inBlossom[v];
      if ((this.label[b] & 4)) {
        base = this.blossomBase[b];
        break;
      }
      path.push(b);
      this.label[b] = 5;
      if (this.labelEnd[b] === -1) {
        v = -1;
      } else {
        v = this.endpoint[this.labelEnd[b]];
        b = this.inBlossom[v];
        v = this.endpoint[this.labelEnd[b]];
      }
      if (w !== -1) {
        v = v ^ w;
        w = w ^ v;
        v = v ^ w;
      }
    }
    for (let ii = 0; ii < path.length; ii++) {
      const b = path[ii];
      this.label[b] = 1;
    }
    return base;
  }

  addBlossom(base: number, k: number): void {
    let x: number, y: number;
    let v = this.edges[k][0];
    let w = this.edges[k][1];
    const bb = this.inBlossom[base];
    let bv = this.inBlossom[v];
    let bw = this.inBlossom[w];
    const b = this.unusedBlossoms.pop()!;
    this.blossomBase[b] = base;
    this.blossomParent[b] = -1;
    this.blossomParent[bb] = b;
    const path: number[] = [];
    this.blossomChilds[b] = path;
    const endPs: number[] = [];
    this.blossomEndPs[b] = endPs;
    while (bv !== bb) {
      this.blossomParent[bv] = b;
      path.push(bv);
      endPs.push(this.labelEnd[bv]);
      v = this.endpoint[this.labelEnd[bv]];
      bv = this.inBlossom[v];
    }
    path.push(bb);
    path.reverse();
    endPs.reverse();
    endPs.push(2 * k);
    while (bw !== bb) {
      this.blossomParent[bw] = b;
      path.push(bw);
      endPs.push(this.labelEnd[bw] ^ 1);
      w = this.endpoint[this.labelEnd[bw]];
      bw = this.inBlossom[w];
    }
    this.label[b] = 1;
    this.labelEnd[b] = this.labelEnd[bb];
    this.dualVar[b] = 0;
    let leaves = this.blossomLeaves(b);
    for (let ii = 0; ii < leaves.length; ii++) {
      v = leaves[ii];
      if (this.label[this.inBlossom[v]] === 2) {
        this.queue.push(v);
      }
      this.inBlossom[v] = b;
    }
    const bestEdgeTo = filledArray(2 * this.nVertex, -1);
    for (let ii = 0; ii < path.length; ii++) {
      bv = path[ii];
      let nbLists: number[][];
      if (this.blossomBestEdges[bv].length === 0) {
        nbLists = [];
        leaves = this.blossomLeaves(bv);
        for (x = 0; x < leaves.length; x++) {
          v = leaves[x];
          nbLists[x] = [];
          for (y = 0; y < this.neighbend[v].length; y++) {
            const p = this.neighbend[v][y];
            nbLists[x].push(~~(p / 2));
          }
        }
      } else {
        nbLists = [this.blossomBestEdges[bv]];
      }
      for (x = 0; x < nbLists.length; x++) {
        const nbList = nbLists[x];
        for (y = 0; y < nbList.length; y++) {
          const k2 = nbList[y];
          let i = this.edges[k2][0];
          let j = this.edges[k2][1];
          if (this.inBlossom[j] === b) {
            i = i ^ j;
            j = j ^ i;
            i = i ^ j;
          }
          const bj = this.inBlossom[j];
          if (bj !== b && this.label[bj] === 1 && (bestEdgeTo[bj] === -1 || this.slack(k2) < this.slack(bestEdgeTo[bj]))) {
            bestEdgeTo[bj] = k2;
          }
        }
      }
      this.blossomBestEdges[bv] = [];
      this.bestEdge[bv] = -1;
    }
    const be: number[] = [];
    for (let ii = 0; ii < bestEdgeTo.length; ii++) {
      const k2 = bestEdgeTo[ii];
      if (k2 !== -1) {
        be.push(k2);
      }
    }
    this.blossomBestEdges[b] = be;
    this.bestEdge[b] = -1;
    for (let ii = 0; ii < this.blossomBestEdges[b].length; ii++) {
      const k2 = this.blossomBestEdges[b][ii];
      if (this.bestEdge[b] === -1 || this.slack(k2) < this.slack(this.bestEdge[b])) {
        this.bestEdge[b] = k2;
      }
    }
  }

  expandBlossom(b: number, endStage: boolean): void {
    let v = -1;
    let ii: number, jj: number;
    for (ii = 0; ii < this.blossomChilds[b].length; ii++) {
      const s = this.blossomChilds[b][ii];
      this.blossomParent[s] = -1;
      if (s < this.nVertex) {
        this.inBlossom[s] = s;
      } else if (endStage && this.dualVar[s] === 0) {
        this.expandBlossom(s, endStage);
      } else {
        const leaves = this.blossomLeaves(s);
        for (jj = 0; jj < leaves.length; jj++) {
          v = leaves[jj];
          this.inBlossom[v] = s;
        }
      }
    }
    if (!endStage && this.label[b] === 2) {
      const entryChild = this.inBlossom[this.endpoint[this.labelEnd[b] ^ 1]];
      let j = this.blossomChilds[b].indexOf(entryChild);
      let jStep: number;
      let endpTrick: number;
      if ((j & 1)) {
        j -= this.blossomChilds[b].length;
        jStep = 1;
        endpTrick = 0;
      } else {
        jStep = -1;
        endpTrick = 1;
      }
      let p = this.labelEnd[b];
      while (j !== 0) {
        this.label[this.endpoint[p ^ 1]] = 0;
        this.label[this.endpoint[pIndex(this.blossomEndPs[b], j - endpTrick) ^ endpTrick ^ 1]] = 0;
        this.assignLabel(this.endpoint[p ^ 1], 2, p);
        this.allowEdge[~~(pIndex(this.blossomEndPs[b], j - endpTrick) / 2)] = true;
        j += jStep;
        p = pIndex(this.blossomEndPs[b], j - endpTrick) ^ endpTrick;
        this.allowEdge[~~(p / 2)] = true;
        j += jStep;
      }
      let bv = pIndex(this.blossomChilds[b], j);
      this.label[this.endpoint[p ^ 1]] = this.label[bv] = 2;
      this.labelEnd[this.endpoint[p ^ 1]] = this.labelEnd[bv] = p;
      this.bestEdge[bv] = -1;
      j += jStep;
      while (pIndex(this.blossomChilds[b], j) !== entryChild) {
        bv = pIndex(this.blossomChilds[b], j);
        if (this.label[bv] === 1) {
          j += jStep;
          continue;
        }
        let leaves = this.blossomLeaves(bv);
        for (ii = 0; ii < leaves.length; ii++) {
          v = leaves[ii];
          if (this.label[v] !== 0) break;
        }
        if (this.label[v] !== 0) {
          this.label[v] = 0;
          this.label[this.endpoint[this.mate[this.blossomBase[bv]]]] = 0;
          this.assignLabel(v, 2, this.labelEnd[v]);
        }
        j += jStep;
      }
    }
    this.label[b] = this.labelEnd[b] = -1;
    this.blossomEndPs[b] = this.blossomChilds[b] = [];
    this.blossomBase[b] = -1;
    this.blossomBestEdges[b] = [];
    this.bestEdge[b] = -1;
    this.unusedBlossoms.push(b);
  }

  augmentBlossom(b: number, v: number): void {
    let t = v;
    while (this.blossomParent[t] !== b) {
      t = this.blossomParent[t];
    }
    if (t > this.nVertex) {
      this.augmentBlossom(t, v);
    }
    let i = this.blossomChilds[b].indexOf(t);
    let j = i;
    let jStep: number;
    let endpTrick: number;
    if ((i & 1)) {
      j -= this.blossomChilds[b].length;
      jStep = 1;
      endpTrick = 0;
    } else {
      jStep = -1;
      endpTrick = 1;
    }
    while (j !== 0) {
      j += jStep;
      t = pIndex(this.blossomChilds[b], j);
      let p = pIndex(this.blossomEndPs[b], j - endpTrick) ^ endpTrick;
      if (t >= this.nVertex) {
        this.augmentBlossom(t, this.endpoint[p]);
      }
      j += jStep;
      t = pIndex(this.blossomChilds[b], j);
      if (t >= this.nVertex) {
        this.augmentBlossom(t, this.endpoint[p ^ 1]);
      }
      this.mate[this.endpoint[p]] = p ^ 1;
      this.mate[this.endpoint[p ^ 1]] = p;
    }
    this.blossomChilds[b] = this.blossomChilds[b].slice(i).concat(this.blossomChilds[b].slice(0, i));
    this.blossomEndPs[b] = this.blossomEndPs[b].slice(i).concat(this.blossomEndPs[b].slice(0, i));
    this.blossomBase[b] = this.blossomBase[this.blossomChilds[b][0]];
  }

  augmentMatching(k: number): void {
    let s: number, p: number;
    const v = this.edges[k][0];
    const w = this.edges[k][1];
    for (let ii = 0; ii < 2; ii++) {
      if (ii === 0) {
        s = v;
        p = 2 * k + 1;
      } else {
        s = w;
        p = 2 * k;
      }
      while (true) {
        const bs = this.inBlossom[s];
        if (bs >= this.nVertex) {
          this.augmentBlossom(bs, s);
        }
        this.mate[s] = p;
        if (this.labelEnd[bs] === -1) break;
        const t = this.endpoint[this.labelEnd[bs]];
        const bt = this.inBlossom[t];
        s = this.endpoint[this.labelEnd[bt]];
        const j = this.endpoint[this.labelEnd[bt] ^ 1];
        if (bt >= this.nVertex) {
          this.augmentBlossom(bt, j);
        }
        this.mate[j] = this.labelEnd[bt];
        p = this.labelEnd[bt] ^ 1;
      }
    }
  }

  private init(): void {
    this.nVertexInit();
    this.maxWeightInit();
    this.endpointInit();
    this.neighbendInit();
    this.mate = filledArray(this.nVertex, -1);
    this.label = filledArray(2 * this.nVertex, 0);
    this.labelEnd = filledArray(2 * this.nVertex, -1);
    this.inBlossomInit();
    this.blossomParent = filledArray(2 * this.nVertex, -1);
    this.blossomChilds = initArrArr(2 * this.nVertex);
    this.blossomBaseInit();
    this.blossomEndPs = initArrArr(2 * this.nVertex);
    this.bestEdge = filledArray(2 * this.nVertex, -1);
    this.blossomBestEdges = initArrArr(2 * this.nVertex);
    this.unusedBlossomsInit();
    this.dualVarInit();
    this.allowEdge = filledArray(this.nEdge, false);
    this.queue = [];
  }

  private blossomBaseInit(): void {
    const base: number[] = [];
    for (let i = 0; i < this.nVertex; i++) {
      base[i] = i;
    }
    const negs = filledArray(this.nVertex, -1);
    this.blossomBase = base.concat(negs);
  }

  private dualVarInit(): void {
    const mw = filledArray(this.nVertex, this.maxWeight);
    const zeros = filledArray(this.nVertex, 0);
    this.dualVar = mw.concat(zeros);
  }

  private unusedBlossomsInit(): void {
    const unusedBlossoms: number[] = [];
    for (let i = this.nVertex; i < 2 * this.nVertex; i++) {
      unusedBlossoms.push(i);
    }
    this.unusedBlossoms = unusedBlossoms;
  }

  private inBlossomInit(): void {
    const inBlossom: number[] = [];
    for (let i = 0; i < this.nVertex; i++) {
      inBlossom[i] = i;
    }
    this.inBlossom = inBlossom;
  }

  private neighbendInit(): void {
    const neighbend = initArrArr(this.nVertex);
    for (let k = 0; k < this.nEdge; k++) {
      const i = this.edges[k][0];
      const j = this.edges[k][1];
      neighbend[i].push(2 * k + 1);
      neighbend[j].push(2 * k);
    }
    this.neighbend = neighbend;
  }

  private endpointInit(): void {
    const endpoint: number[] = [];
    for (let p = 0; p < 2 * this.nEdge; p++) {
      endpoint[p] = this.edges[~~(p / 2)][p % 2];
    }
    this.endpoint = endpoint;
  }

  private nVertexInit(): void {
    let nVertex = 0;
    for (let k = 0; k < this.nEdge; k++) {
      const i = this.edges[k][0];
      const j = this.edges[k][1];
      if (i >= nVertex) nVertex = i + 1;
      if (j >= nVertex) nVertex = j + 1;
    }
    this.nVertex = nVertex;
  }

  private maxWeightInit(): void {
    let maxWeight = 0;
    for (let k = 0; k < this.nEdge; k++) {
      const weight = this.edges[k][2];
      if (weight > maxWeight) {
        maxWeight = weight;
      }
    }
    this.maxWeight = maxWeight;
  }
}

function filledArray<T>(len: number, fill: T): T[] {
  const newArray: T[] = [];
  for (let i = 0; i < len; i++) {
    newArray[i] = fill;
  }
  return newArray;
}

function initArrArr(len: number): number[][] {
  const arr: number[][] = [];
  for (let i = 0; i < len; i++) {
    arr[i] = [];
  }
  return arr;
}

function getMin(arr: number[], start: number, end: number): number {
  let min = Infinity;
  for (let i = start; i <= end; i++) {
    if (arr[i] < min) {
      min = arr[i];
    }
  }
  return min;
}

function pIndex<T>(arr: T[], idx: number): T {
  return idx < 0 ? arr[arr.length + idx] : arr[idx];
}

function blossom(edges: [number, number, number][], maxCardinality: boolean): number[] {
  if (edges.length === 0) {
    return [];
  }
  const edmonds = new Edmonds(edges, maxCardinality);
  return edmonds.maxWeightMatching();
}

export default blossom;
