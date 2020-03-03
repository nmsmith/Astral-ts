export type Obj = {type: "constant", name: string} | {type: "variable", name: string}

/**
 * We store just the NAME of the relation in the atoms,
 * so that the parser knows what to produce. We later
 * map these names to an actual Relation type.
 */
export interface Atom {
    relationName: string
    objects: Obj[]
}

export interface Literal extends Atom {
    readonly sign: "positive" | "negative"
}

/** A strongly connected component. */
export type Component = Set<Relation>

export interface Relation {
    readonly name: string
    rules: Set<Rule>
}

export interface Rule {
    readonly head: Atom
    readonly body: Literal[]
}

export interface RuleGraphInfo<T> {
    readonly rules: Map<Rule, T>
    readonly relations: Map<string, Relation>
    readonly components: Map<Relation, Component>
}

// We take the set of rules as input, analyse the structure of the the underlying graph,
// and return the set of relations and strongly connected components as output.
// We use Tarjan's algorithm to identify the components. Because of the
// way rules are defined, we technically traverse all edges "backwards".
// The input set is a Map type so that the user can attach extra info if desired.
//
// It's quite challenging to compute strongly connected components incrementally,
// so I don't attempt to do this right now. I just reconstruct all information every
// time the set of rules changes:
// https://cs.stackexchange.com/questions/96424/incremental-strongly-connected-components
export function analyseRuleGraph<T>(rules: Map<Rule, T>): RuleGraphInfo<T> {
    // Find all the relations defined in the DB
    const relations = new Map<string, Relation>()
    for (const rule of rules.keys()) {
        // Construct or add to the rule's relation
        const entry = relations.get(rule.head.relationName)
        if (entry === undefined) {
            relations.set(rule.head.relationName, {
                name: rule.head.relationName,
                rules: new Set<Rule>([rule]),
            })
        }
        else entry.rules.add(rule)
        // Construct relations for the body atoms, if necessary
        for (const literal of rule.body) {
            if (!relations.has(literal.relationName)) {
                relations.set(literal.relationName, {
                    name: literal.relationName,
                    rules: new Set<Rule>(),
                })
            }
        }
    }
    // For keeping track of the "depth" at which we saw a node in the active call stack.
    const depths = new Map<string, number>()
    const visitedStack: Relation[] = []
    const components = new Map<Relation, Component>()

    function tarjan(myDepth: number, relationName: string): number {
        depths.set(relationName, myDepth)
        const relation = relations.get(relationName) as Relation
        visitedStack.push(relation)
        const successors = relation.rules
        let lowLink = myDepth
        // Track whether this connected component is trivial (one node, no cycles),
        // or whether there's a cycle.
        let cycleFound = false
        if (successors !== undefined) {
            for (const rule of successors) {
                for (const fact of rule.body) {
                    const itsDepth = depths.get(fact.relationName)
                    if (itsDepth === undefined) {
                        // It's not yet visited
                        const itsLowLink = tarjan(myDepth + 1, fact.relationName)
                        if (itsLowLink <= myDepth) {
                            // It's part of the same connected component as me
                            lowLink = Math.min(lowLink, itsLowLink)
                            cycleFound = true
                        }
                        else {
                            // It's in a newly formed connected component
                            // (and therefore a topological successor)
                        }
                    }
                    else if (itsDepth >= 0) {
                        // It's currently on the stack
                        lowLink = Math.min(lowLink, itsDepth)
                        cycleFound = true
                    }
                    else { // depth is NaN
                        // It's in another pre-connected component
                        // (and therefore a topological successor)
                    }
                }
            }
        }

        if (lowLink === myDepth) {
            // This node started a strongly connected component.
            const component = new Set<Relation>()
            if (cycleFound) {
                // Gather all the other nodes.
                let rel: Relation
                do {
                    rel = visitedStack.pop() as Relation
                    depths.set(rel.name, NaN)
                    component.add(rel)
                    components.set(rel, component)
                }
                while (rel !== relation)
            }
            else {
                // The current node is the whole component.
                const rel = visitedStack.pop() as Relation
                depths.set(rel.name, NaN)
                component.add(rel)
                components.set(rel, component)
            }
        }
        
        return lowLink
    }

    // Start a depth-first search from each yet-to-be-visited node
    for (const relName of relations.keys()) {
        if (depths.get(relName) === undefined) {
            tarjan(0, relName)
        }
    }

    return { rules, relations, components }
}