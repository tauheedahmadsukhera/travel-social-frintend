def rootDir = new File(".")
def command = ["node", "--print", "require.resolve('@react-native/gradle-plugin/package.json', { paths: [require.resolve('react-native/package.json')] })"]
def process = command.execute(null, rootDir)
def text = process.text.trim()
println "Output: |${text}|"
println "Exit value: ${process.exitValue()}"
if (process.exitValue() != 0) {
    println "Error: ${process.err.text}"
}
