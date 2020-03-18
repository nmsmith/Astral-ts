export type Obj = {type: "constant", name: string} | {type: "variable", name: string}

// ------------------------------------- RULES --------------------------------------

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

export interface Rule {
    readonly head: Atom
    readonly body: Literal[]
    readonly unboundVariables: Set<string>
    readonly strategy: null | EvaluationStrategy // cached info for evaluation purposes
}

export type Data = unknown
export type Tuple = Data[]

/** Creates a unique string for the given tuple. This can be used for hashing. */
function tupleUniqueString(tuple: Tuple): string {
    return tuple.map(x => (x as any).toString()).join()
}

/**
 * Represents a deduced tuple, and the ground rule instance that led to the deduction.
 */
export interface Deduction {
    readonly rule: Rule  // the rule via which the deduction was made
    readonly deduction: Tuple  // the deduced tuple
    readonly premiseDeductions: Deduction[][]  // the set of deductions that made each (data source) premise true
}

function findUnboundVariables(head: Atom, body: Literal[]): Set<string> {
    // Track potentially-unbound variable names to check rule safety.
    // Add them to the set if they're seen in the rule head or a negated atom.
    const potUnboundVariables: Set<string> = new Set()
    const boundVariables: Set<string> = new Set()
    // Add vars in the head
    head.objects.forEach(obj => {
        if (obj.type === "variable") potUnboundVariables.add(obj.name)
    })
    // Classify vars in the body
    body.forEach(literal => {
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
    if (body.length === 0) {
        //TODO: Ignoring time temporarily
        // unboundVars.add("time")
    }
    return unboundVars
}


// -------------------------------- RULE EVALUATION ----------------------------------

/** A pointer to a tuple element in a list of tuples */
type TupleElement = {tuple: number, el: number}

interface EqConstraint { // between two elements of two tuples
    type: "eq"
    me: TupleElement
    other: TupleElement
}

interface ConstEqConstraint {
    type: "constEq"
    me: TupleElement
    const: Data
}

type Constant = {type: "constant", value: Data}

interface NegConstraint {
    type: "neg"
    relation: string
    elements: (Constant | TupleElement)[]
}

type Filter = EqConstraint | ConstEqConstraint | NegConstraint

/**
 * Represents a positive literal (whose relation is a data source),
 * with a set of filters on which tuples should be chosen.
 */
interface DataSource {
    relationName: string
    filters: Filter[]
}

interface EvaluationStrategy {
    sources: DataSource[]
    // Ground negations can be checked at the beginning of the
    // rule evaluation; they don't depend on local variables.
    groundNegations: NegConstraint[]
}

/**
 * Computes an evaluation strategy for the given rule.
 * The strategy is specified as a sequence of data sources (relations) from
 * which to draw tuples, combined with a set of filters that each tuple
 * must pass for the implication to remain viable.
 * The ordering of data sources is not optimized; source order is used.
 */
function computeEvaluationStrategy(ruleBody: Literal[]): EvaluationStrategy {
    // Collect the atoms whose relations are data sources (the positive literals),
    // and compute a set of constraints by which their tuples should be filtered.
    const sources: DataSource[] = []
    const varOccurrences = new Map<string, Set<TupleElement>>() // from var name to source indices
    const negatedAtoms: Atom[] = []
    for (const literal of ruleBody) {
        if (literal.sign === "positive") {
            const sourceIndex = sources.length
            const filters: Filter[] = []
            sources.push({relationName: literal.relationName, filters})
            const objs = literal.objects
            for (let objIndex = 0; objIndex < objs.length; ++objIndex) {
                const tupleEl = {tuple: sourceIndex, el: objIndex}
                const obj = objs[objIndex]
                if (obj.type === "variable") {
                    const pastRefs = varOccurrences.get(obj.name)
                    if (pastRefs === undefined) {
                        varOccurrences.set(obj.name, new Set([tupleEl]))
                    }
                    else {
                        // must filter tuples from this source by equality
                        // with past occurrences of this variable
                        pastRefs.forEach(ref => {
                            filters.push({
                                type: "eq",
                                me: tupleEl,
                                other: ref,
                            })
                        })
                        // now track this variable occurrence
                        pastRefs.add(tupleEl)
                    }
                }
                else { // must filter tuples by this constant
                    filters.push({
                        type: "constEq",
                        me: tupleEl,
                        const: obj.name,
                    })
                }
            }
        }
        else {
            negatedAtoms.push(literal)
        }
    }
    // Now that we've gone through the whole body, we can decide when negation
    // constraints should be checked, by finding the point in the list of sources
    // where the last variable referenced in the negation occurs.
    // Some negations may be ground; we track those separately.
    const groundNegations: NegConstraint[] = []
    negatedAtoms.forEach(atom => {
        const elements: (Constant | TupleElement)[] = []
        let indexOfLastSource = -1
        atom.objects.forEach(obj => {
            if (obj.type === "constant") {
                elements.push({type: "constant", value: obj.name})
            }
            else { // find first occurrence of the var, and add that to the constraint
                const t: TupleElement = varOccurrences.get(obj.name)?.values().next().value
                elements.push(t)
                indexOfLastSource = Math.max(indexOfLastSource, t.tuple)
            }
        })
        const filter: NegConstraint = {
            type: "neg",
            relation: atom.relationName,
            elements,
        }
        if (indexOfLastSource >= 0) {
            // Check this negation constraint when this source is assigned
            sources[indexOfLastSource].filters.push(filter)
        }
        else { // this negated atom is ground
            groundNegations.push(filter)
        }
    })

    return {sources, groundNegations}
}

/**
 * Construct a rule from head and body atoms.
 * This involves caching some derived data that will be needed later.
 */
export function rule(head: Atom, body: Literal[]): Rule {
    const unboundVariables = findUnboundVariables(head, body)
    const strategy = unboundVariables.size > 0
        ? computeEvaluationStrategy(body)
        : null
    return {head, body, unboundVariables, strategy}
}


// ----------------------------- THE RULE GRAPH ------------------------------

export interface Relation {
    readonly name: string
    ownRules: Set<Rule>
    dependentRules: Set<Rule>
}

/** A strongly connected component. */
export type Component = Set<Relation>

export interface RuleGraphInfo<RuleSource> {
    readonly rules: Map<Rule, RuleSource>
    readonly relations: Map<string, Relation>
    readonly components: Map<Relation, Component>
    // A map from each rule to the indices of its (positive) literals which
    // refer to the rule's own component.
    readonly internalReferences: Map<Rule, Set<number>>
// Errors:
    // A map from each rule to the indices of its internally-negated literals.
    readonly internalNegations: Map<Rule, Set<number>>
}

export function componentOf(rule: Rule, graph: RuleGraphInfo<unknown>): Component {
    const relation = graph.relations.get(rule.head.relationName) as Relation
    return graph.components.get(relation) as Component
}

// We take the set of rules as input, analyse the structure of the the underlying graph,
// and return the set of relations and strongly connected components as output.
// We use Tarjan's algorithm to identify the components. Because of the
// way rules are defined, we technically traverse all edges "backwards".
// The input set is a Map type so that the user can attach extra info if desired.
//
// The components Map holds the components in a topological order, which is a suitable
// evaluation order.
//
// It's quite challenging to compute strongly connected components incrementally,
// so I don't attempt to do this right now. I just reconstruct all information every
// time the set of rules changes:
// https://cs.stackexchange.com/questions/96424/incremental-strongly-connected-components
export function analyseRuleGraph<RuleSource>(rules: Map<Rule, RuleSource>): RuleGraphInfo<RuleSource> {
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

    return { rules, relations, components, internalReferences, internalNegations }
}

export function computeDeductions(graph: RuleGraphInfo<unknown>): Map<Rule, Set<Deductions>> {
    const ruleDeductions = new Map<Rule, Map<string, Deduction>>()         // for return
    const relationDeductions = new Map<Relation, Map<string, Deduction>>() // for compute convenience
    function evaluateRuleFull(rule: Rule): void {
        const sources = rule.strategy.sources
        const tupleCombo: Deduction[] = []
        const myRelation = graph.relations.get(rule.head.relationName) as Relation
        const myRelationDeductions = relationDeductions.get(myRelation) as Set<Deduction>
        function enumerateTupleCombos(sourceI: number): void {
            if (sourceI < sources.length) {
                // Select feasible tuples
                const source = sources[sourceI]
                const relation = graph.relations.get(source.relationName) as Relation
                const deductions = relationDeductions.get(relation) as Set<Deduction>
                for (const deduction of deductions.values()) {
                    tupleCombo[sourceI] = deduction
                }
            }
            else { // Make a deduction from this tuple combo
                const deduction = ...
                // TODO: How to test if the TUPLE is already in the set???
                // Need value semantics.
                if (!myRelationDeductions.has(deduction)) {
                    myRelationDeductions.add(deduction)
                }
            }
        }
        enumerateTupleCombos(0)
    }
    // for each component, deduce its tuples
    for (const component of graph.components.values()) {
        const rules = []
        // gather all the component's rules and initialize deductions
        for (const relation of component) {
            relationDeductions.set(relation, new Set())
            for (const rule of relation.ownRules) {
                rules.push(rule)
                ruleDeductions.set(rule, new Set())
            }
        }
        let lastAddedDeductions = new Map<Relation, Set<Deduction>>()
        // the first iteration is a full evaluation
        for (const rule of rules) {
            evaluateRuleFull(rule)
        }
        // the remaining iterations are incremental
        do {
            const newDeductions = new Map<Relation, Set<Deduction>>()

            lastAddedDeductions = newDeductions
        } while (lastAddedDeductions.size > 0)
    }
    return ruleDeductions
}