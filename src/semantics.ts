export type Obj = {type: "literal", name: string} | {type: "variable", name: string}

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

export type PrimitiveData = number | string
export type Tuple = PrimitiveData[]

function tupleEq(t1: Tuple, t2: Tuple): boolean {
    if (t1.length !== t2.length) return false

    for (let i = 0; i < t1.length; ++i) {
        if (t1[i] !== t2[i]) return false
    }

    return true
}

type TupleID = string

/** Creates a unique string for the given tuple. This can be used for hashing. */
function tupleID(tuple: Tuple): TupleID {
    return tuple.map(x => (x as any).toString()).join()
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
// The method by which we evaluate rules:
// Instead of binding tuple elements to rule variables, we define "constraints" which
// are the result of "compiling away" the variables; we check tuple elements directly.
// This means we don't have to assign all variables in the rule to determine whether
// the assignment ultimately leads to a true premise; we can abandon an assignment early.

/** A pointer to a tuple element in a list of tuples */
type VarBindingLocation = {tuple: number, el: number}

function isData(x: PrimitiveData | VarBindingLocation): x is PrimitiveData {
    return (x as VarBindingLocation).tuple === undefined
}

/// A tuple with this constraint has an element which must match the
// value of a bound variable.
interface EqConstraint {
    type: "eq"
    myElement: number // constrainted tuple element
    binding: VarBindingLocation // location where variable was bound
}

/// A tuple with this constraint has an element which must match a literal.
interface EqLiteralConstraint {
    type: "eqLiteral"
    myElement: number
    literal: PrimitiveData
}

type PredicateArgument = PrimitiveData | VarBindingLocation

/// A tuple with this constraint provides the last variable binding
/// needed to determine whether a negation is satisfied.
interface NegConstraint {
    type: "neg"
    relationName: string
    args: PredicateArgument[]
}

interface GroundNegConstraint {
    relationName: string
    tuple: Tuple
}

/// A constraint by which a tuple must be filtered.
type Filter = EqConstraint | EqLiteralConstraint | NegConstraint

/**
 * Represents a positive literal (whose relation is a data source),
 * with a set of filters on which tuples should be chosen.
 */
interface DataSource {
    premiseIndex: number
    relationName: string
    filters: Filter[]
}

interface EvaluationStrategy {
    sources: DataSource[]
    headArgs: PredicateArgument[]
    // Ground negations can be checked at the beginning of the
    // rule evaluation; they don't depend on local variables.
    groundNegations: GroundNegConstraint[]
}

/**
 * Computes an evaluation strategy for the given rule.
 * The strategy is specified as a sequence of data sources (relations) from
 * which to draw tuples, combined with a set of filters that each tuple
 * must pass for the implication to remain viable.
 * The ordering of data sources is not optimized; source order is used.
 */
function computeEvaluationStrategy(ruleHead: Atom, ruleBody: Literal[]): EvaluationStrategy {
    const sources: DataSource[] = []
    const varBindings = new Map<string, VarBindingLocation>()
    const negatedAtoms: Atom[] = []
    // Start by running through the body to set up all the data sources
    // and collect the negative literals.
    for (const literal of ruleBody) {
        if (literal.sign === "positive") {
            const premiseIndex = sources.length
            const filters: Filter[] = []
            sources.push({premiseIndex, relationName: literal.relationName, filters})
            const objs = literal.objects
            for (let objIndex = 0; objIndex < objs.length; ++objIndex) {
                const tupleEl = {tuple: premiseIndex, el: objIndex}
                const obj = objs[objIndex]
                if (obj.type === "variable") {
                    const binding = varBindings.get(obj.name)
                    if (binding === undefined) {
                        varBindings.set(obj.name, tupleEl)
                    }
                    else {
                        // must filter tuples from this source by equality
                        // with the bound variable
                        filters.push({
                            type: "eq",
                            myElement: objIndex,
                            binding,
                        })
                    }
                }
                else { // must filter tuples by this literal
                    filters.push({
                        type: "eqLiteral",
                        myElement: objIndex,
                        literal: obj.name,
                    })
                }
            }
        }
        else {
            negatedAtoms.push(literal)
        }
    }
    // We now know how to fill the variables of the head atom
    const headArgs: (PrimitiveData | VarBindingLocation)[] = []
    ruleHead.objects.forEach(obj => headArgs.push(obj.type === "literal"
        ? obj.name
        : varBindings.get(obj.name) as VarBindingLocation
    ))
    // Now that we've found all the data sources, we can decide when negation
    // constraints should be checked, by finding the point in the list of sources
    // where the last variable referenced in the negation occurs.
    // Some negations may be ground; we track those separately.
    const groundNegations: GroundNegConstraint[] = []
    negatedAtoms.forEach(atom => {
        const args: (PrimitiveData | VarBindingLocation)[] = []
        let indexOfLastSource = -1
        atom.objects.forEach(obj => {
            if (obj.type === "literal") {
                args.push(obj.name)
            }
            else {
                // Store the binding location in the constraint, so it can be looked up.
                // Note: The existence of a valid binding location depends on the rule
                // being SAFE. If it isn't, then this arg will be undefined.
                const loc = varBindings.get(obj.name) as VarBindingLocation
                args.push(loc)
                indexOfLastSource = Math.max(indexOfLastSource, loc.tuple)
            }
        })
        if (indexOfLastSource >= 0) {
            // Check this negation constraint when this source binds its element(s)
            sources[indexOfLastSource].filters.push({
                type: "neg",
                relationName: atom.relationName,
                args,
            })
        }
        else { // this negated atom is ground
            groundNegations.push({
                relationName: atom.relationName,
                tuple: args as PrimitiveData[],
            })
        }
    })

    return {sources, headArgs, groundNegations}
}

/**
 * Construct a rule from head and body atoms.
 * This involves caching some derived data that will be needed later.
 */
export function rule(head: Atom, body: Literal[]): Rule {
    const unboundVariables = findUnboundVariables(head, body)
    const strategy = unboundVariables.size === 0
        ? computeEvaluationStrategy(head, body)
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


// ---------------------------- RULE GRAPH EVALUATION ---------------------------

/**
 * A ground instance of a rule. We use this for provenance tracking.
 */
export interface GroundRule {
    readonly ofRule: Rule  // the rule from which this ground instance was instantiated
    readonly sourcePremises: TupleWithDeductions[] // tuple for each source (positive) premise
}

// N.B. each tuple has at least ONE deduction, i.e. these arrays have size >= 1.
export type TupleWithDeductions = {tuple: Tuple, deductions: GroundRule[]}

// For looking up a specific deduced tuple, since we can't rely on reference equality.
export type TupleLookup = Map<TupleID, TupleWithDeductions>

export function computeDeductions(graph: RuleGraphInfo<unknown>): Map<Rule, TupleLookup> {
    const allTuplesOfRules = new Map<Rule, TupleLookup>()         // for return
    const allTuplesOfRelations = new Map<Relation, TupleLookup>() // for compute convenience
    function relationHasTuple(relationName: string, queryTuple: Tuple): boolean {
        const relation = graph.relations.get(relationName) as Relation
        const relationTuples = allTuplesOfRelations.get(relation) as TupleLookup
        for (const t of relationTuples.values()) {
            if (tupleEq(queryTuple, t.tuple)) {
                return true
            }
        }
        return false
    }
    // Evaluate the rule from scratch (if no "lastIterationTuples" are given), or incrementally.
    function evaluateRule(
        rule: Rule,
        currIterationTuples: TupleLookup,
        lastIterationTuples: Map<Relation, TupleLookup>,
    ): void {
        if (rule.strategy === null) return // Rule isn't executable
        const fullEvaluation = lastIterationTuples.size === 0
        // First check ground negations. We need to do this on every evaluation, unless we blacklist
        // the rule after the full evaluation. As an optimization, we could blacklist if the full
        // evaluation fails on ground negations OR negations involving only non-component-bound variables.
        for (const neg of rule.strategy.groundNegations) {
            if (relationHasTuple(neg.relationName, neg.tuple)) return // generate no tuples
        }
        const sources = rule.strategy.sources
        const sourceTuples: TupleWithDeductions[] = []
        let lastNewTupleSourceI = -1
        if (!fullEvaluation) { // Find out the last source that has new tuples to assign
            for (let sourceI = 0; sourceI < sources.length; ++sourceI) {
                const sourceRelation = graph.relations.get(sources[sourceI].relationName) as Relation
                const lastSourceRelationTuples = lastIterationTuples.get(sourceRelation) as TupleLookup
                if (lastSourceRelationTuples !== undefined) {
                    lastNewTupleSourceI = sourceI
                }
            }
        }
        // Now iterate over all ground premise (source) sequences
        function enumerateTupleCombos(sourceI: number, newTupleChosen: boolean): void {
            function passesFilters(tuple: Tuple): boolean { 
                for (const filter of sources[sourceI].filters) {
                    switch (filter.type) {
                        case "eqLiteral":
                            if (tuple[filter.myElement] !== filter.literal) {
                                return false
                            }
                            break
                        case "eq": {
                            const varValue = sourceTuples[filter.binding.tuple].tuple[filter.binding.el]
                            if (tuple[filter.myElement] !== varValue) {
                                return false
                            }
                            break
                        }
                        case "neg": {
                            const negTuple: Tuple = []
                            for (const arg of filter.args) {
                                if (isData(arg)) {
                                    negTuple.push(arg)
                                } else {
                                    const varValue = sourceTuples[arg.tuple].tuple[arg.el]
                                    negTuple.push(varValue)
                                }
                            }
                            if (relationHasTuple(filter.relationName, negTuple)) {
                                return false
                            }
                            break
                        }
                    }
                }
                return true
            }
            if (sourceI < sources.length) {
                const sourceRelation = graph.relations.get(sources[sourceI].relationName) as Relation
                if (fullEvaluation || newTupleChosen || lastNewTupleSourceI > sourceI) {
                    // Assign each old tuple
                    const allSourceRelationTuples = allTuplesOfRelations.get(sourceRelation) as TupleLookup
                    for (const t of allSourceRelationTuples.values()) {
                        if (passesFilters(t.tuple)) {
                            sourceTuples[sourceI] = t
                            enumerateTupleCombos(sourceI + 1, newTupleChosen)
                        }
                    }
                }
                if (!fullEvaluation) {
                    // Assign each new tuple
                    const lastSourceRelationTuples = lastIterationTuples.get(sourceRelation) as TupleLookup
                    if (lastSourceRelationTuples !== undefined) {
                        for (const t of lastSourceRelationTuples.values()) {
                            if (passesFilters(t.tuple)) {
                                sourceTuples[sourceI] = t
                                enumerateTupleCombos(sourceI + 1, true)
                            }
                        }
                    }
                }
            }
            else { // Make a deduction from this tuple combo
                // Construct the tuple
                const deducedTuple: Tuple = []
                for (const arg of (rule.strategy as EvaluationStrategy).headArgs) {
                    if (isData(arg)) {
                        deducedTuple.push(arg)
                    }
                    else {
                        const varValue = sourceTuples[arg.tuple].tuple[arg.el]
                        deducedTuple.push(varValue)
                    }
                }
                // Construct the ground rule that explains the deduction
                const groundRule: GroundRule = {
                    ofRule: rule,
                    sourcePremises: sourceTuples,
                }
                // Log the deduction.
                // If the tuple already existed before this iteration, add the new deduction.
                // If the tuple is new this iteration, add the tuple (if necessary) and the new deduction.
                const id = tupleID(deducedTuple)
                const preIterationTuple = allTuplesOfRelations.get(graph.relations.get(rule.head.relationName) as Relation)?.get(id)
                if (preIterationTuple === undefined) {
                    const currIterationTuple = currIterationTuples.get(id)
                    if (currIterationTuple === undefined) {
                        currIterationTuples.set(id, {tuple: deducedTuple, deductions: [groundRule]})
                    }
                    else {
                        currIterationTuple.deductions.push(groundRule)
                    }
                }
                else {
                    preIterationTuple.deductions.push(groundRule)
                }
                // Add the deduction to those of the rule.
                // We can do this immediately since we don't use this info during evaluation.
                const allRuleTuples = allTuplesOfRules.get(rule) as TupleLookup
                const existingTuple = allRuleTuples.get(id)
                if (existingTuple === undefined) {
                    allRuleTuples.set(id, {tuple: deducedTuple, deductions: [groundRule]})
                }
                else {
                    existingTuple.deductions.push(groundRule)
                }
            }
        }
        enumerateTupleCombos(0, fullEvaluation)
    }
    // For each component, deduce its tuples.
    // The components are already topologically sorted,
    // so they will be evaluated in a correct & reasonable order.
    for (const component of graph.components.values()) {
        const rules = []
        // Gather all the component's rules and initialize deductions
        for (const relation of component) {
            allTuplesOfRelations.set(relation, new Map())
            for (const rule of relation.ownRules) {
                rules.push(rule)
                allTuplesOfRules.set(rule, new Map())
            }
        }
        // The first iteration is a full evaluation, and the remaining ones are incremental
        let lastAddedTuples = new Map<Relation, TupleLookup>()
        do {
            // Compute the tuples for this iteration
            const newlyAddedTuples = new Map<Relation, TupleLookup>()
            for (const relation of component) {
                const newTuplesForRelation: TupleLookup = new Map()
                for (const rule of relation.ownRules) {
                    evaluateRule(rule, newTuplesForRelation, lastAddedTuples)
                }
                if (newTuplesForRelation.size > 0) {
                    newlyAddedTuples.set(relation, newTuplesForRelation)
                }
            }
            // Add these tuples to the set of all deduced tuples
            newlyAddedTuples.forEach((lookup, relation) => {
                const existingLookup = allTuplesOfRelations.get(relation) as TupleLookup
                lookup.forEach((tuple, tupleID) => {
                    existingLookup.set(tupleID, tuple)
                })
            })
            lastAddedTuples = newlyAddedTuples
        } while (lastAddedTuples.size > 0)
    }
    return allTuplesOfRules
}