# SBSG Typescript preprocessor
Creates Hapi's Joi validators from Typescript interface definitions.

# Install
```
npm install
npm build # this is automaticly called on npm install
```

# Usage

Put your TS interfaces to file(s) e.g. `/path/to/interfaces.ts`:
Then transfer these TS definitions into Joi
```
import {exportTsDeclarations} from type 'typescript-preprocessor'

const definitions: string = exportTsDeclarations(['/path/to/interfaces.ts'])
...
// save definitions into file that you will load on your hapi server startup
...
import {JoiObject} from 'joi'
const joiDefinitions: JoiObject = await importTsDeclarationsToJoi(definitions)
```

Optionaly you can provide your own definitions for complex types
```
// let's assume there exist this interface
namespace myNamespace {
    interface myInterface {
        myProperty: string
    }
}

const customProperties: CustomProperties = {
    types: {
        [nameof.full<myNamespace.myInterface>() as string]: async () => Joi.string().lowercase().trim(),
    },
    modifiers: {
        [nameof.full<myNamespace.DefaultEmptyArray>() as string]: async (joiValidator) => joiValidator.default([])
    }
}

// then you can import definition and custom types like this
const joiDefinitions: JoiObject = await importTsDeclarationsToJoi(definitions, customProperties)
```
When using custom properties setup your `types` as basic validators and `modifiers` something that modifies them 
e.g. add default value. You can then use them in your interfaces like this
```
interface myInterface {
    myProperty: baseValidatorType & modifier1 & modifier2 & ...
}
```


# TODO
- extend option of custom/virtual properties
    - type expressions (combining of types)
        - basic `myType1 | myType2`
        - complex with parentheses `myType1 | myType2 | (myType3 & myType4)`
    - expose defined custom properties for type expressions
        - this could(should?) reduce amount of virtual properties defined
