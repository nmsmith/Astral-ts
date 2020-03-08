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
    ownRules: Set<Rule>
    dependentRules: Set<Rule>
}

export interface Rule {
    readonly head: Atom
    readonly body: Literal[]
}

export interface RuleGraphInfo<RuleSource> {
    readonly rules: Map<Rule, RuleSource>
    readonly relations: Map<string, Relation>
    readonly components: Map<Relation, Component>
    // A map from each rule to the indices of its (positive) literals which
    // refer to the rule's own component.
    readonly internalReferences: Map<Rule, Set<number>>
// Errors:
    readonly unboundVariables: Map<Rule, Set<string>>
    // A map from each rule to the indices of its internally-negated literals.
    readonly internalNegations: Map<Rule, Set<number>>
}

export function componentOf(rule: Rule, graph: RuleGraphInfo<unknown>): Component {
    const relation = graph.relations.get(rule.head.relationName) as Relation
    return graph.components.get(relation) as Component
}

function findUnboundVariables(rules: IterableIterator<Rule>): Map<Rule, Set<string>> {
    const unboundVariables = new Map<Rule, Set<string>>()
    for (const rule of rules) {
        // Track potentially-unbound variable names to check rule safety.
        // Add them to the set if they're seen in the rule head or a negated atom.
        const potUnboundVariables: Set<string> = new Set()
        const boundVariables: Set<string> = new Set()
        // Add vars in the head
        rule.head.objects.forEach(obj => {
            if (obj.type === "variable") potUnboundVariables.add(obj.name)
        })
        // Classify vars in the body
        rule.body.forEach(literal => {
            if (literal.sign === "positive") {
                literal.objects.forEach(obj => {
                    if (obj.type === "variable") boundVariables.add(obj.name)
                })
            }
            else {
                literal.objects.forEach(obj => {
                    if (obj.type === "variable") potUnboundVariables.add(obj.name)
                })
            }
        })
        // Filter out the unbound vars
        const unboundVars = new Set(
            [...potUnboundVariables].filter(x => !boundVariables.has(x)))
        // Don't forget about the implicit time variable
        if (rule.body.length === 0) {
            unboundVars.add("time")
        }
        unboundVariables.set(rule, unboundVars)
    }
    return unboundVariables
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
export function analyseRuleGraph<RuleSource>(rules: Map<Rule, RuleSource>): RuleGraphInfo<RuleSource> {
    const unboundVariables = findUnboundVariables(rules.keys())
    // Find all the relations defined in the DB
    const relations = new Map<string, Relation>()
    for (const rule of rules.keys()) {
        // Construct or add to the rule's relation
        const entry = relations.get(rule.head.relationName)
        if (entry === undefined) {
            relations.set(rule.head.relationName, {
                name: rule.head.relationName,
                ownRules: new Set<Rule>([rule]),
                dependentRules: new Set<Rule>(),
            })
        }
        else entry.ownRules.add(rule)
        // Construct relations for the body atoms, if necessary,
        // and assign this rule as a dependent of those relations.
        for (const literal of rule.body) {
            if (relations.has(literal.relationName)) {
                relations.get(literal.relationName)?.dependentRules.add(rule)
            }
            else {
                relations.set(literal.relationName, {
                    name: literal.relationName,
                    ownRules: new Set<Rule>(),
                    dependentRules: new Set<Rule>([rule]),
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
        const successors = relation.ownRules
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

    // Now find all the internal references and internal negations within each component
    const internalReferences = new Map<Rule, Set<number>>()
    const internalNegations = new Map<Rule, Set<number>>()
    for (const component of components.values()) {
        const relationNames = new Set<string>()
        // Collect all the relation names for this component.
        // This names should not occur in negated form within the component.
        for (const relation of component) {
            relationNames.add(relation.name)
        }
        // Check all the rule bodies associated with the component
        for (const relation of component) {
            for (const rule of relation.ownRules) {
                let bodyIndex = 0
                for (const literal of rule.body) {
                    if (relationNames.has(literal.relationName)) {
                        if (internalReferences.has(rule)) {
                            internalReferences.get(rule)?.add(bodyIndex)
                        }
                        else {
                            internalReferences.set(rule, new Set([bodyIndex]))
                        }
                        if (literal.sign === "negative") {
                            if (internalNegations.has(rule)) {
                                internalNegations.get(rule)?.add(bodyIndex)
                            }
                            else {
                                internalNegations.set(rule, new Set([bodyIndex]))
                            }
                        }
                    }
                    ++bodyIndex
                }
            }
        }
    }

    return { rules, relations, components, internalReferences, unboundVariables, internalNegations }
}