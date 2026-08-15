export default function RenderPropDepthSix() {
    return (
        <Page>
            <Renderer
                render={() => (
                    <LevelOne>
                        <LevelTwo>
                            <LevelThree>
                                <LevelFour>
                                    <LevelFive>
                                        <LevelSix />
                                    </LevelFive>
                                </LevelFour>
                            </LevelThree>
                        </LevelTwo>
                    </LevelOne>
                )}
            />
        </Page>
    );
}
