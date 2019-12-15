/* eslint-disable */
import Vue from "vue"
// Load the CSS reset before the App (which will inject further styles)
import "./reset.css"
// @ts-ignore Load the app's module (TypeScript doesn't recognise .vue so stop it complaining)
import App from "./app"

new Vue({
  el: "#app",
  components: { App },
  render: h => h(App)
})
