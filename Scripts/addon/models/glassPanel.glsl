precision highp float;
uniform sampler2D u_diffuse;
in vec2 v_texcoord0;
in vec3 v_normal;
in vec3 v_vertex;

void main(void) {

    vec4 color = texture(u_diffuse, v_texcoord0);
    color = vec4(vec3(color) * color.a, 1);
    gl_FragColor = color;
}