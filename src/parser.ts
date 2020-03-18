import {Obj, Atom, Literal, Rule, rule} from "./semantics"

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
    let head: Atom | undefined = undefined
    const body: Literal[] = []
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
        const parts2 = parts1[1].split(")")
        const relationText = parts1[0]
        const objectTexts = (parts2[0].length > 0) ? parts2[0].split(",") : []
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

        const trimmedRel = relationText.trim()

        // --- Check relation name ---
        if (trimmedRel.length === 0 || (trimmedRel[0] === "¬" && trimmedRel.slice(1).trim().length === 0)) {
            return fail(`Line ${lineNumber}: Missing a relation name.`)
        }

        const negPosition = trimmedRel.indexOf("¬")
        if (negPosition >= 0) {
            if (negPosition > 0 || trimmedRel.split("¬").length > 2) {
                return fail(`Line ${lineNumber}: A negation symbol can only be placed at the start of a line.`)
            }
            else if (trimmedRel[1] !== " ") {
                return fail(`Line ${lineNumber}: A negation symbol must be followed by a space.`)
            }
        }

        if (relationText.indexOf(",") !== -1) {
            return fail(`Line ${lineNumber}: Unexpected comma in relation name.`)
        }
        else if (relationText.indexOf("#") !== -1) {
            return fail(`Line ${lineNumber}: Unexpected # symbol in relation name.`)
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
            if (!(/^ {2}[^\s]/.test(relationText))) {
                return fail(`Line ${lineNumber}: Line should start with exactly two spaces.`)
            }
            else if (relationText.slice(2).trim() !== relationText.slice(2)) {
                return fail(`Line ${lineNumber}: Unexpected whitespace after relation name.`)
            }
        }

        const relationName = trimmedRel.split("¬ ").slice(-1)[0]
        const sign: "positive" | "negative" = negPosition >= 0 ? "negative" : "positive"

        if (/\s\s/.test(relationName)) {
            return fail(`Line ${lineNumber}: Unexpected double space. Words should be separated with a single space.`)
        }

        // --- Test object names ---
        const objects: Obj[] = []
        for (const objectText of objectTexts) {
            if (objectText.trim().length === 0) {
                return fail(`Line ${lineNumber}: Missing an object name.`)
            }
            else if (objectText.indexOf("¬") !== -1) {
                return fail(`Line ${lineNumber}: Unexpected negation symbol in object name.`)
            }
            else if (/\s\s/.test(objectText)) {
                return fail(`Line ${lineNumber}: Unexpected double space. Words should be separated with a single space.`)
            }
            else if (objectText.slice(1).trim() !== objectText.slice(1)) {
                return fail(`Line ${lineNumber}: Unexpected whitespace after object name.`)
            }
            
            const objectName = objectText.trim()
            if (objectName.indexOf("#") > 0) {
                console.log(objectName)
                console.log("FOUND AT ", objectName.indexOf("#"))
                return fail(`Line ${lineNumber}: The # symbol can only be used as the first character of an object name.`)
            }

            if (objectName[0] === "#") { // constants start with #
                objects.push({type: "constant", name: objectName})
            }
            else {
                objects.push({type: "variable", name: objectName})
            }
        }

        if (lineNumber === 1) {
            head = {relationName, objects}
        }
        else {
            body.push({sign, relationName, objects})
        }
    }

    return {result: "success", rule: rule(head as Atom, body)}
}