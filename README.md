# SBSG Typescript preprocessor
Creates Hapi's Joi validators from Typescript interface definitions.

# TODO
- extend option of custom/virtual properties
    - type expressions (combining of types)
        - basic `myType1 | myType2`
        - complex with parentheses `myType1 | myType2 | (myType3 & myType4)`
    - expose defined custom properties for type expressions
        - this could(should?) reduce amount of virtual properties defined

- documentation
