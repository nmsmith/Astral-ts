export type PrimitiveData = number | string

export type Obj = {type: "constant", value: PrimitiveData} | {type: "variable", name: string}

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

/// A tuple with this constraint has an element which must match a constant.
interface EqConstantConstraint {
    type: "eqConstant"
    myElement: number
    constant: PrimitiveData
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
type Filter = EqConstraint | EqConstantConstraint | NegConstraint

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
                else { // must filter tuples by this constant
                    filters.push({
                        type: "eqConstant",
                        myElement: objIndex,
                        constant: obj.value,
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
    ruleHead.objects.forEach(obj => headArgs.push(obj.type === "constant"
        ? obj.value
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
            if (obj.type === "constant") {
                args.push(obj.value)
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
    arity: number // number of terms in the relation's tuples
    readonly rules: Set<Rule>
    readonly dependentRules: Set<Rule>
}

/** A strongly connected component. */
export type Component = {
    readonly relations: Set<Relation>
    readonly dependencies: Set<Component>
    readonly dependents: Set<Component>
}

export interface RuleGraphInfo<RuleSource> {
    readonly rules: Map<Rule, RuleSource>
    readonly relations: Map<string, Relation>
    readonly components: Map<Relation, Component>
    // A map from each rule to the indices of its (positive) literals which
    // refer to the rule's own component.
    readonly internalReferences: Map<Rule, Set<number>>
// Errors:
    // A map from each rule to the indices of its literals with incorrect arity.
    readonly incorrectArities: Map<Rule, Set<number>>
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
        const myRelation = relations.get(rule.head.relationName)
        if (myRelation === undefined) {
            relations.set(rule.head.relationName, {
                name: rule.head.relationName,
                arity: rule.head.objects.length,
                rules: new Set<Rule>([rule]),
                dependentRules: new Set<Rule>(),
            })
        }
        else {
            // Update arity in case it was set wrong by a premise.
            // TODO: Relations and their arities should be defined/fixed at
            // first use, rather than determined in this ad-hoc manner.
            myRelation.arity = rule.head.objects.length
            myRelation.rules.add(rule)
        }
        // Construct relations for the body atoms, if necessary,
        // and assign this rule as a dependent of those relations.
        for (const literal of rule.body) {
            const premiseRelation = relations.get(literal.relationName)
            if (premiseRelation === undefined) {
                relations.set(literal.relationName, {
                    name: literal.relationName,
                    arity: literal.objects.length,
                    rules: new Set<Rule>(),
                    dependentRules: new Set<Rule>([rule]),
                })
            } else premiseRelation.dependentRules.add(rule)
        }
    }
    // Now check that each relation is referenced with correct arities
    const incorrectArities = new Map<Rule, Set<number>>()
    for (const rule of rules.keys()) {
        const mismatches = new Set<number>()
        // Check for arity mismatch
        const headRelationArity = relations.get(rule.head.relationName)?.arity
        if (headRelationArity !== rule.head.objects.length) {
            mismatches.add(0)
        }
        let i = 1
        for (const premise of rule.body) {
            const relationArity = relations.get(premise.relationName)?.arity
            if (relationArity !== premise.objects.length) {
                mismatches.add(i)
            }
            ++i
        }
        if (mismatches.size > 0) {
            incorrectArities.set(rule, mismatches)
        }
    }

    // If a node is in the component currently being explored, nodeStatus stores its depth.
    // Otherwise, nodeStatus stores the component that the node belongs to.
    const nodeStatus = new Map<string, number | Component>()
    // Nodes in the component currently being explored.
    const currentComponent: Relation[] = []
    // Components reachable by the component currently being explored.
    let componentDependencies = new Set<Component>()
    // For output.
    const components = new Map<Relation, Component>()

    function tarjan(myDepth: number, relationName: string): number | Component {
        nodeStatus.set(relationName, myDepth)
        const relation = relations.get(relationName) as Relation
        currentComponent.push(relation)
        const successors = relation.rules
        let lowLink = myDepth
        if (successors !== undefined) {
            for (const rule of successors) {
                for (const fact of rule.body) {
                    let itsStatus = nodeStatus.get(fact.relationName)
                    if (itsStatus === undefined) {
                        // It's not yet visited. Get its lowlink/component.
                        itsStatus = tarjan(myDepth + 1, fact.relationName)
                    }

                    if (typeof itsStatus === "number") {
                        // It's part of the same connected component as me.
                        lowLink = Math.min(lowLink, itsStatus)
                    }
                    else {
                        // It's part of a component that has already been constructed.
                        componentDependencies.add(itsStatus)
                    }
                }
            }
        }

        if (lowLink === myDepth) {
            // This node started a strongly connected component.
            const component = {
                relations: new Set<Relation>(),
                dependencies: componentDependencies,
                dependents: new Set<Component>(),
            }
            for (const dependency of componentDependencies) {
                dependency.dependents.add(component)
            }
            componentDependencies = new Set() // reset for the next component

            // Gather all the relations that belong to this component.
            let rel: Relation
            do {
                rel = currentComponent.pop() as Relation
                nodeStatus.set(rel.name, component)
                component.relations.add(rel)
                components.set(rel, component)
            }
            while (rel !== relation)
            return component
        }
        else return lowLink
    }

    // Start a depth-first search from each yet-to-be-visited node
    for (const relName of relations.keys()) {
        if (nodeStatus.get(relName) === undefined) {
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
        for (const relation of component.relations) {
            relationNames.add(relation.name)
        }
        // Check all the rule bodies associated with the component
        for (const relation of component.relations) {
            for (const rule of relation.rules) {
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

    return { rules, relations, components, internalReferences, incorrectArities, internalNegations }
}


// ---------------------------- RULE GRAPH EVALUATION ---------------------------

/**
 * A ground instance of a rule. We use this for provenance tracking.
 */
export interface GroundRule {
    readonly ofRule: Rule  // the rule from which this ground instance was instantiated
    readonly sourcePremises: TupleWithDerivations[] // tuple for each source (positive) premise
}

// TODO: We can reduce provenance memory overhead to just 16 bytes per tuple by storing merely
// the "minimal proof tree height" and the generating rule, then searching for the derivation
// from scratch (just the one rule) when the user asks for it. See the paper "Provenance for
// Large-Scale Datalog".
// The minimal proof tree is guaranteed to involve no circular reasoning.
export interface Derivation {
    readonly groundRule: GroundRule
    validated: boolean // whether the derivation has been checked for circularity (e.g. P => P)
}

// N.B. each tuple has at least ONE derivation, i.e. these arrays have size >= 1.
export type TupleWithDerivations = {tuple: Tuple, derivations: Derivation[]}

// For looking up a specific derived tuple, since we can't rely on reference equality.
export type TupleLookup = Map<TupleID, TupleWithDerivations>

export function computeDerivations(graph: RuleGraphInfo<unknown>): Map<Rule, TupleLookup> {
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
        if (rule.strategy === null || graph.incorrectArities.has(rule)) return // Rule isn't executable
        const fullEvaluation = lastIterationTuples.size === 0
        // First check ground negations. We need to do this on every evaluation, unless we blacklist
        // the rule after the full evaluation. As an optimization, we could blacklist if the full
        // evaluation fails on ground negations OR negations involving only non-component-bound variables.
        for (const neg of rule.strategy.groundNegations) {
            if (relationHasTuple(neg.relationName, neg.tuple)) return // generate no tuples
        }
        const sources = rule.strategy.sources
        const sourceTuples: TupleWithDerivations[] = []
        let lastNewTupleSourceI = -1
        if (!fullEvaluation) { // Find out the last source that has new tuples to assign
            for (let sourceI = 0; sourceI < sources.length; ++sourceI) {
                const sourceRelation = graph.relations.get(sources[sourceI].relationName) as Relation
                const lastSourceRelationTuples = lastIterationTuples.get(sourceRelation) as TupleLookup
                if (lastSourceRelationTuples !== undefined) {
                    lastNewTupleSourceI = sourceI
                }
            }
            if (lastNewTupleSourceI === -1) return // no work to do
        }
        // Now iterate over all ground premise (source) sequences
        function enumerateTupleCombos(sourceI: number, newTupleChosen: boolean): void {
            function passesFilters(tuple: Tuple): boolean { 
                for (const filter of sources[sourceI].filters) {
                    switch (filter.type) {
                        case "eqConstant":
                            if (tuple[filter.myElement] !== filter.constant) {
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
                if (!fullEvaluation && sourceI === lastNewTupleSourceI && !newTupleChosen) {
                    // Only assign each tuple derived in the last iteration
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
                else {
                    // Assign each tuple from all previous iterations (including new ones)
                    const allSourceRelationTuples = allTuplesOfRelations.get(sourceRelation) as TupleLookup
                    const lastSourceRelationTuples = lastIterationTuples.get(sourceRelation) as TupleLookup
                    for (const t of allSourceRelationTuples.values()) {
                        if (passesFilters(t.tuple)) {
                            sourceTuples[sourceI] = t
                            enumerateTupleCombos(sourceI + 1,
                                (fullEvaluation || newTupleChosen)
                                    ? true
                                    : lastSourceRelationTuples.has(tupleID(t.tuple))
                            )
                        }
                    }
                }
            }
            else { // Make a derivation from this tuple combo
                // Construct the tuple
                const derivedTuple: Tuple = []
                for (const arg of (rule.strategy as EvaluationStrategy).headArgs) {
                    if (isData(arg)) {
                        derivedTuple.push(arg)
                    }
                    else {
                        const varValue = sourceTuples[arg.tuple].tuple[arg.el]
                        derivedTuple.push(varValue)
                    }
                }
                // Construct the ground rule that explains the derivation
                const groundRule: GroundRule = {
                    ofRule: rule,
                    sourcePremises: sourceTuples,
                }
                // Log the derivation.
                const derivation = {groundRule, validated: false}
                // If the tuple already existed before this iteration, add the new derivation.
                // If the tuple is new this iteration, add the tuple (if necessary) and the new derivation.
                const id = tupleID(derivedTuple)
                const preIterationTuple = allTuplesOfRelations.get(graph.relations.get(rule.head.relationName) as Relation)?.get(id)
                if (preIterationTuple === undefined) {
                    // The derivation of this tuple can't be unfounded if the tuple
                    // isn't in the list of input tuples for this iteration.
                    derivation.validated = true
                    const currIterationTuple = currIterationTuples.get(id)
                    if (currIterationTuple === undefined) {
                        currIterationTuples.set(id, {
                            tuple: derivedTuple,
                            derivations: [derivation],
                        })
                    }
                    else currIterationTuple.derivations.push(derivation)
                }
                else preIterationTuple.derivations.push(derivation)
                // Add the derivation to those of the rule.
                // We can do this immediately since we don't use this info during evaluation.
                const allRuleTuples = allTuplesOfRules.get(rule) as TupleLookup
                const existingTuple = allRuleTuples.get(id)
                if (existingTuple === undefined) {
                    allRuleTuples.set(id, {
                        tuple: derivedTuple,
                        derivations: [derivation],
                    })
                }
                else {
                    existingTuple.derivations.push(derivation)
                }
            }
        }
        enumerateTupleCombos(0, fullEvaluation)
    }
    // For each component, derive its tuples.
    // The components are already topologically sorted,
    // so they will be evaluated in a correct & reasonable order.
    for (const component of graph.components.values()) {
        const rules = []
        // Gather all the component's rules and initialize derivations
        for (const relation of component.relations) {
            allTuplesOfRelations.set(relation, new Map())
            for (const rule of relation.rules) {
                rules.push(rule)
                allTuplesOfRules.set(rule, new Map())
            }
        }
        // The first iteration is a full evaluation, and the remaining ones are incremental
        let lastAddedTuples = new Map<Relation, TupleLookup>()
        do {
            // Compute the tuples for this iteration
            const newlyAddedTuples = new Map<Relation, TupleLookup>()
            for (const relation of component.relations) {
                const newTuplesForRelation: TupleLookup = new Map()
                for (const rule of relation.rules) {
                    evaluateRule(rule, newTuplesForRelation, lastAddedTuples)
                }
                if (newTuplesForRelation.size > 0) {
                    newlyAddedTuples.set(relation, newTuplesForRelation)
                }
            }
            // Add these tuples to the set of all derived tuples
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

export function validateDerivation(tuple: TupleWithDerivations, index: number): void {
    // TODO: Check that this derivation is well-founded through analysis of its dependency graph.
    tuple.derivations[index].validated = true
}