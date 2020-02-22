import {Obj, Fact, Rule} from "./semantics"

export type ParseResult =
    {result: "failure", reason: string}
  | {result: "success", rule: Rule}
  | {result: "noRule"}

export function parseRule(s: string): ParseResult {
    function fail(reason: string): ParseResult {
        return {result: "failure", reason}
    }

    if (s === "") {
        return {result: "noRule"}
    }

    // Rule head and body to be constructed
    let head: Fact | undefined = undefined
    const body: Fact[] = []
    // Track variable names to check rule safety.
    // Add them to the set if they're seen in the rule head,
    // and remove them if they're subsequently seen in the rule body.
    const unsafeVariables: Set<string> = new Set()
    const lines = s.split("\n") // always guaranteed to be at least one line
    for (let lineNumber = 1; lineNumber <= lines.length; ++lineNumber) {
        const line = lines[lineNumber-1]
        if (line.trim().length === 0) {
            continue // Ignore empty lines
        }

        // --- Check parentheses ---
        if (line.split("(").length > 2 || line.split(")").length > 2) {
            return fail(`Line ${lineNumber}: Too many parentheses. They should only be used to delimit the object list.`)
        }
        const b1 = line.indexOf("(")
        const b2 = line.indexOf(")")
        if (b1 === -1 && b2 === -1) {
            return fail(`Line ${lineNumber}: Missing parentheses.`)
        }
        else if (b1 === -1 || b2 === -1) {
            return fail(`Line ${lineNumber}: Missing parenthesis.`)
        }
        else if (b2 < b1) {
            return fail(`Line ${lineNumber}: Mismatched parentheses.`)
        }
        
        const parts1 = line.split("(")
        const parts2 = line.split(")")
        const relationText = parts1[0]
        const objectTexts = parts2[0].split(",")
        const remainder = parts2[1]

        // --- Check end of line ---
        if (lineNumber === 1) {
            const r = remainder.trim()
            if (r.length > 1 || (r.length === 1 && r[0] !== ":")) {
                return fail(`Line ${lineNumber}: Unexpected characters at the end of the line. The only character after the closing parenthesis should be a colon.`)
            }
            else if (r.length === 0) {
                return fail("The first line (the premise) must end with a colon.")
            }
            else if (remainder[0] !== ":") {
                return fail(`Line ${lineNumber}: Unexpected spaces before colon.`)
            }
        }
        else {
            if (remainder.trim().length !== 0) {
                return fail(`Line ${lineNumber}: Unexpected characters after the closing parenthesis.`)
            }
        }

        // --- Check relation name ---
        if (relationText.trim().length === 0) {
            return fail(`Line ${lineNumber}: Missing a relation name.`)
        }
        else if (relationText.indexOf(",") !== -1) {
            return fail(`Line ${lineNumber}: Unexpected comma in relation name.`)
        }
        
        // --- Test for inappropriate whitespace in relation names ---
        if (lineNumber === 1) {
            if (/\s/.test(relationText[0])) {
                return fail(`Line ${lineNumber}: Unexpected whitespace at start of line.`)
            }
            else if (relationText.trim() !== relationText) {
                return fail(`Line ${lineNumber}: Unexpected whitespace after relation name.`)
            }
        }
        else {
            if (!(/\t/.test(relationText[0]))) {
                return fail(`Line ${lineNumber}: Line should start with a tab.`)
            }
            else if (/\s/.test(relationText[1])) {
                return fail(`Line ${lineNumber}: Unexpected whitespace before the relation name (after the tab).`)
            }
            else if (relationText.slice(1).trim() !== relationText.slice(1)) {
                return fail(`Line ${lineNumber}: Unexpected whitespace after relation name.`)
            }
        }

        if (/\s\s/.test(relationText)) {
            return fail(`Line ${lineNumber}: Unexpected double space. Words should be separated with a single space.`)
        }

        const relationName = relationText.trim()

        // --- Test object names ---
        const objects: Obj[] = []
        for (const objectText of objectTexts) {
            if (objectText.trim().length === 0) {
                return fail(`Line ${lineNumber}: Missing an object name.`)
            }
            else if (/\s\s/.test(objectText)) {
                return fail(`Line ${lineNumber}: Unexpected double space. Words should be separated with a single space.`)
            }
            else if (objectText.slice(1).trim() !== objectText.slice(1)) {
                return fail(`Line ${lineNumber}: Unexpected whitespace after object name.`)
            }
            
            const objectName = objectText.trim()
            if (objectName[0] === objectName[0].toUpperCase()) {
                objects.push({type: "variable", name: objectName})
                 if (lineNumber === 1) {
                     unsafeVariables.add(objectName)
                 }
                 else {
                     unsafeVariables.delete(objectName)
                 }
            }
            else {
                objects.push({type: "constant", name: objectName})
            }
        }

        const fact = {relation: relationName, objects}
        if (lineNumber === 1) {
            head = fact
        }
        else {
            body.push(fact)
        }
    }

    // --- The rule was successfully parsed, but we need to check safety criteria
    if (unsafeVariables.size > 0) {
        let errorText = "This rule is unsafe -- the following variables appear in the head but not the body: "
        let first = true
        unsafeVariables.forEach(variable => {
            if (first) {
                first = false
            }
            else {
                errorText += ", "
            }
            errorText += variable
        })
        return fail(errorText)
    }

    return {result: "success", rule: {head: head as Fact, body}}
}