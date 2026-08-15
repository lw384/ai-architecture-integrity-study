export default function RenderPropDepthFive() {
    return (
        <Page>
            <Renderer
                render={() => (
                    <LevelOne>
                        <LevelTwo>
                            <LevelThree>
                                <LevelFour>
                                    <LevelFive />
                                </LevelFour>
                            </LevelThree>
                        </LevelTwo>
                    </LevelOne>
                )}
            />
        </Page>
    );
}
